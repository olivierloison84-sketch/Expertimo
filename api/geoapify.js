export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  if (!lat || !lng) {
    return new Response(JSON.stringify({ error: 'lat et lng requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  const categories = 'education.school,education.kindergarten,commercial.supermarket,commercial.bakery,healthcare.pharmacy,public_transport,leisure.park,leisure.garden';
  const apiKey = process.env.GEOAPIFY_API_KEY;
  const geoUrl = 'https://api.geoapify.com/v2/places?categories=' + categories + '&filter=circle:' + lng + ',' + lat + ',800&limit=30&apiKey=' + apiKey;
  try {
    const res = await fetch(geoUrl);
    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
