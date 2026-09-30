export const config = { runtime: 'edge' };

const HEADERS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

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
  const railCategories = 'public_transport.subway,public_transport.train,public_transport.tram';
  const apiKey = process.env.GEOAPIFY_API_KEY;
  const circle = '&filter=circle:' + lng + ',' + lat + ',800';
  const base = 'https://api.geoapify.com/v2/places?categories=';
  const mainUrl = base + categories + circle + '&limit=30&apiKey=' + apiKey;
  const railUrl = base + railCategories + circle + '&limit=20&apiKey=' + apiKey;
  try {
    const [res, railRes] = await Promise.all([fetch(mainUrl), fetch(railUrl).catch(() => null)]);
    const text = await res.text();
    // Si la requête principale échoue, ou si celle des gares échoue : comportement d'avant (réponse principale seule).
    if (!res.ok || !railRes || !railRes.ok) return new Response(text, { status: res.status, headers: HEADERS });
    let data, rail;
    try { data = JSON.parse(text); rail = await railRes.json(); }
    catch (e) { return new Response(text, { status: res.status, headers: HEADERS }); }
    if (!data || !Array.isArray(data.features) || !rail || !Array.isArray(rail.features)) {
      return new Response(text, { status: res.status, headers: HEADERS });
    }
    const seen = new Set(data.features.map(function (f) { return f && f.properties && f.properties.place_id; }));
    rail.features.forEach(function (f) {
      const id = f && f.properties && f.properties.place_id;
      if (id && seen.has(id)) return;
      if (id) seen.add(id);
      data.features.push(f);
    });
    return new Response(JSON.stringify(data), { status: 200, headers: HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: HEADERS });
  }
}
