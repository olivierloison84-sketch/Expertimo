/* Privency — authentification multi-comptes dans un même navigateur.
 *
 * Problème résolu : supabase-js ne gère qu'une session par navigateur (clé
 * localStorage unique + BroadcastChannel entre onglets). Ici, chaque compte a
 * sa propre session sous « privency-auth-<uid> » (le storageKey isole aussi le
 * BroadcastChannel), et chaque onglet retient son compte actif dans
 * sessionStorage (« privency_active_uid »).
 *
 * À charger APRÈS supabase-js (ou à utiliser avec PrivencyAuth.getClient(createClient)
 * quand supabase-js est importé en module ESM).
 */
(function (w) {
  'use strict';

  var SUPABASE_URL = 'https://hhqcumnatnslfjpsrmgb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Asv3-Q2Q9XSA_gvV1nB74Q_0N6prN2E';

  var ACTIVE_KEY = 'privency_active_uid';
  // 'session' = compte NON mémorisé : session ET cache uniquement dans le sessionStorage de l'onglet.
  // Absent = compte mémorisé (localStorage). Case « Mémoriser ce compte sur cet ordinateur ».
  var MODE_KEY = 'privency_active_mode';
  var SESSION_PREFIX = 'privency-auth-';
  var NO_ACCOUNT = 'none';                                   // client sans session (aucun compte actif)
  var LEGACY_SESSION_KEY = 'sb-hhqcumnatnslfjpsrmgb-auth-token'; // ancienne clé unique de supabase-js

  // Clés navigateur propres à un agent → suffixées « :<uid> ».
  var SCOPED_KEYS = ['_agent_profile', '_draft_bien', 'privency_draft', 'privency_last_fiche', 'privency_nb_fiches_publiees'];
  var TIP_PREFIX = 'privency_tip_'; // + clé du conseil → « privency_tip_xxx:<uid> »
  // Effacées à la déconnexion (comme avant : les conseils déjà vus et le compteur restent).
  var CLEARED_ON_LOGOUT = ['_agent_profile', '_draft_bien', 'privency_draft', 'privency_last_fiche'];

  // ── Accès storage protégés (mode privé, quota, storage bloqué) ──
  function lsGetRaw(k) { try { return w.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSetRaw(k, v) { try { w.localStorage.setItem(k, v); } catch (e) {} }
  function lsRemoveRaw(k) { try { w.localStorage.removeItem(k); } catch (e) {} }
  function lsKeys() {
    var out = [];
    try { for (var i = 0; i < w.localStorage.length; i++) out.push(w.localStorage.key(i)); } catch (e) {}
    return out;
  }
  function ssGet(k) { try { return w.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { w.sessionStorage.setItem(k, v); } catch (e) {} }
  function ssRemove(k) { try { w.sessionStorage.removeItem(k); } catch (e) {} }
  function parseJSON(raw) { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }

  function capitalize(s) {
    return String(s || '').trim().split(/\s+/).map(function (x) {
      return x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
    }).join(' ');
  }

  // ── Compte actif de l'onglet ──
  function activeUid() { return ssGet(ACTIVE_KEY) || null; }
  function activeMode() { return ssGet(MODE_KEY) === 'session' ? 'session' : 'local'; }
  function storeOf(mode) { try { return mode === 'session' ? w.sessionStorage : w.localStorage; } catch (e) { return null; } }
  function stRemove(st, k) { try { if (st) st.removeItem(k); } catch (e) {} }
  function stKeys(st) {
    var out = [];
    try { for (var i = 0; i < st.length; i++) out.push(st.key(i)); } catch (e) {}
    return out;
  }

  // Stockage scopé par compte : lsKey('_draft_bien') → '_draft_bien:<uid>'.
  function lsKey(k, uid) { return k + ':' + (uid || activeUid() || NO_ACCOUNT); }
  // Sans compte actif, on n'écrit ni ne lit rien (jamais de clé « :none » partagée).
  // Compte non mémorisé : le cache vit dans le sessionStorage de l'onglet, jamais dans localStorage.
  function lsGet(k) { var u = activeUid(), st = storeOf(activeMode()); try { return u && st ? st.getItem(lsKey(k, u)) : null; } catch (e) { return null; } }
  function lsSet(k, v) { var u = activeUid(), st = storeOf(activeMode()); try { if (u && st) st.setItem(lsKey(k, u), v); } catch (e) {} }
  function lsRemove(k) { var u = activeUid(); if (u) stRemove(storeOf(activeMode()), lsKey(k, u)); }

  // ── Migration des anciennes valeurs non scopées : au PREMIER compte activé
  // après déploiement, puis suppression (les comptes suivants repartent à vide). ──
  function adoptLegacyData(uid) {
    if (!uid) return;
    var keys = SCOPED_KEYS.slice();
    lsKeys().forEach(function (k) {
      if (k.indexOf(TIP_PREFIX) === 0 && k.indexOf(':') < 0) keys.push(k);
    });
    keys.forEach(function (k) {
      var v = lsGetRaw(k);
      if (v === null) return;
      if (lsGetRaw(lsKey(k, uid)) === null) lsSetRaw(lsKey(k, uid), v);
      lsRemoveRaw(k);
    });
  }

  function setActive(uid, mode) {
    ssSet(ACTIVE_KEY, uid);
    if (mode === 'session') {
      ssSet(MODE_KEY, 'session');
    } else {
      ssRemove(MODE_KEY);
      adoptLegacyData(uid); // l'ancien cache non scopé n'est migré que vers un compte mémorisé
    }
  }
  function clearActive() { ssRemove(ACTIVE_KEY); ssRemove(MODE_KEY); }

  // ── JWT → session minimale (adoption synchrone d'un retour par URL) ──
  function decodeJwt(token) {
    try {
      var b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var bin = w.atob(b);
      var json = decodeURIComponent(bin.split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  function sessionFromTokens(access, refresh) {
    var p = decodeJwt(access);
    if (!p || !p.sub) return null;
    var now = Math.floor(Date.now() / 1000);
    var exp = p.exp || (now + 3600);
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'bearer',
      expires_in: Math.max(exp - now, 0),
      expires_at: exp,
      user: {
        id: p.sub, aud: p.aud, role: p.role, email: p.email, phone: p.phone || '',
        app_metadata: p.app_metadata || {}, user_metadata: p.user_metadata || {}
      }
    };
  }

  // ── Migration de l'ancienne session unique (clé par défaut de supabase-js) ──
  function migrateLegacySession() {
    var raw = lsGetRaw(LEGACY_SESSION_KEY);
    if (!raw) return;
    var s = parseJSON(raw);
    if (s && s.refresh_token && s.user && s.user.id) {
      if (lsGetRaw(SESSION_PREFIX + s.user.id) === null) lsSetRaw(SESSION_PREFIX + s.user.id, raw);
      // L'onglet qui déclenche la migration reste connecté sur ce compte
      // (considéré comme mémorisé : personne n'est déconnecté au déploiement).
      if (!activeUid()) setActive(s.user.id, 'local');
    }
    lsRemoveRaw(LEGACY_SESSION_KEY);
  }

  // ── Retour par URL (confirmation d'email, magic link, OAuth implicite) :
  // #access_token=…&refresh_token=… → session enregistrée sous le compte concerné.
  // Les liens de récupération de mot de passe sont laissés à reset-password.html.
  // Par défaut NON mémorisé (sessionStorage de l'onglet), sauf si l'agent a déjà ce compte mémorisé. ──
  var consumedUrlSession = false;
  function adoptUrlSession() {
    var hash = w.location.hash || '';
    if (hash.indexOf('access_token=') < 0) return null;
    var params = new w.URLSearchParams(hash.replace(/^#/, ''));
    if (params.get('type') === 'recovery') return null;
    var access = params.get('access_token'), refresh = params.get('refresh_token');
    if (!access || !refresh) return null;
    var session = sessionFromTokens(access, refresh);
    if (!session) return null;
    var mode = lsGetRaw(SESSION_PREFIX + session.user.id) !== null ? 'local' : 'session';
    try { storeOf(mode).setItem(SESSION_PREFIX + session.user.id, JSON.stringify(session)); } catch (e) {}
    setActive(session.user.id, mode);
    try { w.history.replaceState(null, '', w.location.pathname + w.location.search); } catch (e) {}
    consumedUrlSession = true;
    return session;
  }

  // ── Clients supabase ──
  function makeClient(uid, factory, mode) {
    var create = factory || (w.supabase && w.supabase.createClient);
    if (!create) throw new Error('supabase-js non chargé');
    var auth = {
      storageKey: SESSION_PREFIX + (uid || NO_ACCOUNT),
      persistSession: !!uid,
      autoRefreshToken: !!uid,
      detectSessionInUrl: false   // les retours par URL sont traités par adoptUrlSession()
    };
    // Compte non mémorisé : la session vit dans le sessionStorage de l'onglet (même storageKey).
    if (uid && mode === 'session') auth.storage = w.sessionStorage;
    return create(SUPABASE_URL, SUPABASE_KEY, { auth: auth });
  }

  // Client jetable : rien n'est écrit dans le storage, pas de BroadcastChannel
  // partagé. Sert à authentifier / inscrire / récupérer un mot de passe sans
  // toucher à la session d'un autre compte.
  function createTempClient(extra) {
    var create = w.supabase && w.supabase.createClient;
    if (!create) throw new Error('supabase-js non chargé');
    var auth = {
      storageKey: 'privency-tmp-' + Math.random().toString(36).slice(2),
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: !!(extra && extra.detectSessionInUrl)
    };
    return create(SUPABASE_URL, SUPABASE_KEY, { auth: auth });
  }

  var _client = null;
  // Client de la page = compte actif de l'onglet (ou client vide si aucun).
  function getClient(factory) {
    if (!_client) {
      var uid = activeUid();
      _client = makeClient(uid, factory, activeMode());
      w.privencyAuth = _client;
      // Session issue d'un retour par URL : reconstruite depuis le JWT, on la
      // complète (objet user entier) auprès de Supabase en arrière-plan.
      if (consumedUrlSession && uid) {
        var st = storeOf(activeMode()), s = null;
        try { s = parseJSON(st.getItem(SESSION_PREFIX + uid)); } catch (e) {}
        if (s) {
          _client.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token }).catch(function () {});
        }
      }
    }
    return _client;
  }

  // ── Comptes connus sur cet ordinateur ──
  function listAccounts() {
    var out = [];
    lsKeys().forEach(function (k) {
      if (k.indexOf(SESSION_PREFIX) !== 0) return;
      var uid = k.slice(SESSION_PREFIX.length);
      if (!uid || uid === NO_ACCOUNT) return;
      var s = parseJSON(lsGetRaw(k));
      if (!s || !s.refresh_token) return;
      var prof = parseJSON(lsGetRaw(lsKey('_agent_profile', uid))) || {};
      var meta = (s.user && s.user.user_metadata) || {};
      out.push({
        uid: uid,
        email: (s.user && s.user.email) || prof.email || '',
        prenom: capitalize(prof.prenom || meta.prenom),
        nom: capitalize(prof.nom || meta.nom),
        photo: prof.photo_url || ''
      });
    });
    out.sort(function (a, b) {
      return (a.prenom + a.nom + a.email).localeCompare(b.prenom + b.nom + b.email);
    });
    return out;
  }

  // ── Connexion ──
  // Enregistre une session obtenue via un client temporaire sous « privency-auth-<uid> »
  // et active ce compte dans l'onglet.
  // remember=true : localStorage (compte mémorisé, listé dans « Qui êtes-vous ? »).
  // remember=false : sessionStorage de l'onglet uniquement. Une session mémorisée
  // existante du même compte n'est jamais retirée dans ce cas.
  async function storeSession(session, remember) {
    var uid = session.user.id;
    var mode = remember ? 'local' : 'session';
    var client = makeClient(uid, null, mode);
    var res = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (res.error) throw res.error;
    if (remember) {
      // La session mémorisée remplace celle de l'onglet (session + cache d'onglet de ce compte).
      stRemove(w.sessionStorage, SESSION_PREFIX + uid);
      stKeys(w.sessionStorage).forEach(function (k) {
        if (k.slice(-(uid.length + 1)) === ':' + uid) stRemove(w.sessionStorage, k);
      });
    }
    setActive(uid, mode);
    return uid;
  }

  async function signInWithPassword(email, password, remember) {
    var tmp = createTempClient();
    var res = await tmp.auth.signInWithPassword({ email: email, password: password });
    if (res.error) return { error: res.error };
    if (!res.data || !res.data.session) return { error: new Error('Session absente') };
    try {
      await storeSession(res.data.session, !!remember);
    } catch (e) {
      return { error: e };
    }
    return { session: res.data.session };
  }

  // Clic sur un compte connu : réactive sa session dans l'onglet, sans mot de passe.
  // Renvoie false si le refresh token est expiré/révoqué (→ redemander le mot de passe).
  async function activate(uid) {
    var client = makeClient(uid, null, 'local');
    try {
      var res = await client.auth.getSession(); // rafraîchit au besoin
      if (!res || !res.data || !res.data.session || res.data.session.user.id !== uid) return false;
    } catch (e) { return false; }
    setActive(uid, 'local'); // un compte listé est par définition mémorisé
    return true;
  }

  // ── Déconnexion / changement / retrait ──
  // Ne touche QUE le compte actif de l'onglet.
  async function signOutActive() {
    w.__privencyLoggingOut = true; // évite la double redirection via l'événement SIGNED_OUT
    var uid = activeUid(), mode = activeMode(), st = storeOf(mode);
    if (uid) {
      try { await getClient().auth.signOut({ scope: 'local' }); } catch (e) {}
      stRemove(st, SESSION_PREFIX + uid);
      if (mode === 'session') {
        // Compte non mémorisé : tout ce que l'onglet détient de ce compte disparaît.
        stKeys(st).forEach(function (k) {
          if (k.slice(-(uid.length + 1)) === ':' + uid) stRemove(st, k);
        });
      } else {
        CLEARED_ON_LOGOUT.forEach(function (k) { stRemove(st, lsKey(k, uid)); });
      }
    }
    clearActive();
  }

  // « Changer de compte » : l'onglet oublie son compte. Un compte mémorisé reste
  // connu de l'ordinateur ; un compte non mémorisé serait sinon injoignable
  // (session seulement dans cet onglet) : on le déconnecte proprement.
  async function switchAccount() {
    if (activeUid() && activeMode() === 'session') await signOutActive();
    clearActive();
    w.location.replace('/login.html');
  }

  // « Retirer ce compte » de l'ordinateur : session + tout le cache de ce compte.
  async function removeAccount(uid) {
    try { await makeClient(uid).auth.signOut({ scope: 'local' }); } catch (e) {}
    lsRemoveRaw(SESSION_PREFIX + uid);
    lsKeys().forEach(function (k) {
      if (k.slice(-(uid.length + 1)) === ':' + uid) lsRemoveRaw(k);
    });
    // Ne retire que la session mémorisée ; un onglet éventuellement ouvert en mode non mémorisé est laissé tel quel.
    if (activeUid() === uid && activeMode() === 'local') clearActive();
  }

  // ── Titre d'onglet : « Olivier · Privency » ──
  function refreshTitle(session) {
    try {
      var prof = parseJSON(lsGet('_agent_profile')) || {};
      var meta = (session && session.user && session.user.user_metadata) || {};
      var prenom = capitalize(prof.prenom || meta.prenom);
      if (prenom) w.document.title = prenom + ' · Privency';
    } catch (e) {}
  }

  // ── Initialisation synchrone (avant toute création de client) ──
  migrateLegacySession();
  adoptUrlSession();
  var _uid = activeUid();
  if (_uid && activeMode() === 'local') adoptLegacyData(_uid);

  w.PrivencyAuth = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_KEY: SUPABASE_KEY,
    consumedUrlSession: consumedUrlSession,
    activeUid: activeUid,
    activeMode: activeMode,
    lsKey: lsKey,
    lsGet: lsGet,
    lsSet: lsSet,
    lsRemove: lsRemove,
    getClient: getClient,
    createTempClient: createTempClient,
    listAccounts: listAccounts,
    signInWithPassword: signInWithPassword,
    storeSession: storeSession,
    activate: activate,
    signOutActive: signOutActive,
    switchAccount: switchAccount,
    removeAccount: removeAccount,
    refreshTitle: refreshTitle
  };
})(window);
