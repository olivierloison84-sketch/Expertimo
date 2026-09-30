export const config = { runtime: 'edge' };

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
// Les données de quartier changent très rarement : cache 24 h côté Vercel (uniquement sur une réponse complète et réussie).
const HEADERS_CACHE = Object.assign({}, HEADERS, { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' });
const RAIL_RE = /^public_transport\.(subway|train|tram|light_rail)$/;
const isRail = (f) => !!(f && f.properties && (f.properties.categories || []).some((c) => RAIL_RE.test(c)));
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const coordsOf = (f) => {
  const p = f.properties || {};
  const c = (f.geometry && f.geometry.coordinates) || [];
  return { lat: p.lat != null ? p.lat : c[1], lon: p.lon != null ? p.lon : c[0] };
};
// Distance approximative en mètres (suffisant pour repérer un même arrêt)
const meters = (a, b) => {
  const dLat = (a.lat - b.lat) * 111320;
  const dLon = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

export default async function handler(req) {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  if (!lat || !lng) {
    return new Response(JSON.stringify({ error: 'lat et lng requis' }), { status: 400, headers: HEADERS });
  }
  const categories = 'education.school,childcare.kindergarten,commercial.supermarket,commercial.food_and_drink,healthcare.pharmacy,public_transport,public_transport.bus,public_transport.subway,public_transport.train,public_transport.tram,leisure.park';
  // Gares / RER / métro / tram : demandés à part. Avec une seule requête limitée à 30 résultats, les nombreux
  // arrêts de bus (et écoles, commerces…) évincent les gares, qui n'apparaissent alors jamais sur la carte.
  const railCategories = 'public_transport.subway,public_transport.train,public_transport.tram,public_transport.light_rail';
  const apiKey = process.env.GEOAPIFY_API_KEY;
  const circle = '&filter=circle:' + lng + ',' + lat + ',800';
  const base = 'https://api.geoapify.com/v2/places?categories=';
  const mainUrl = base + categories + circle + '&limit=30&apiKey=' + apiKey;
  const railUrl = base + railCategories + circle + '&limit=20&apiKey=' + apiKey;
  try {
    // Délai maximum de 4 s pour la requête des gares : au-delà, on renvoie la réponse principale seule.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const [res, railRes] = await Promise.all([fetch(mainUrl), fetch(railUrl, { signal: ctrl.signal }).catch(() => null)]);
    clearTimeout(timer);
    const text = await res.text();
    // Si la requête principale échoue, ou si celle des gares échoue : comportement d'avant (réponse principale seule).
    if (!res.ok || !railRes || !railRes.ok) return new Response(text, { status: res.status, headers: HEADERS });
    let data, rail;
    try { data = JSON.parse(text); rail = await railRes.json(); }
    catch (e) { return new Response(text, { status: res.status, headers: HEADERS }); }
    if (!data || !Array.isArray(data.features) || !rail || !Array.isArray(rail.features)) {
      return new Response(text, { status: res.status, headers: HEADERS });
    }
    // Fusion : on garde tout le reste de la réponse principale, et on regroupe les gares / stations.
    // Une même gare peut remonter plusieurs fois (station + quais, catégories tram et light_rail) :
    // on ne garde qu'une entrée par nom à moins de 150 m, en privilégiant la station (railway=station).
    const seen = new Set();
    const candidates = [];
    const others = [];
    data.features.concat(rail.features).forEach(function (f) {
      const id = f && f.properties && f.properties.place_id;
      if (id) { if (seen.has(id)) return; seen.add(id); }
      (isRail(f) ? candidates : others).push(f);
    });
    const isStation = (f) => (((f.properties || {}).datasource || {}).raw || {}).railway === 'station';
    candidates.sort((a, b) => (isStation(b) ? 1 : 0) - (isStation(a) ? 1 : 0));
    const kept = [];
    candidates.forEach(function (f) {
      const n = norm((f.properties || {}).name), c = coordsOf(f);
      const dup = n && kept.some(function (k) {
        return norm((k.properties || {}).name) === n && meters(coordsOf(k), c) < 150;
      });
      if (!dup) kept.push(f);
    });
    data.features = others.concat(kept);
    return new Response(JSON.stringify(data), { status: 200, headers: HEADERS_CACHE });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: HEADERS });
  }
}
