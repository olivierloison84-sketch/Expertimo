insert into public.agent_fiches (agent_user_id, filename, label)
values
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '11-residence-de-la-croix-blanche-91380-chilly-mazarin-FINAL.html', '11 residence de la croix blanche 91380 chilly mazarin'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '11-square-jean-baptiste-clement-91390-morsang-sur-orge-FINAL.html', '11 square jean baptiste clement 91390 morsang sur orge'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '110-avenue-philippe-auguste-paris-75011-roquette-FINAL.html', '110 avenue philippe auguste paris 75011 roquette'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '17-rue-henri-barbusse-91380-chilly-mazarin-FINAL.html', '17 rue henri barbusse 91380 chilly mazarin'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '2-allee-du-vivier-sud-91410-saint-escobille-FINAL.html', '2 allee du vivier sud 91410 saint escobille'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '2-bis-rue-charles-bernard-94290-villeneuve-le-roi-FINAL.html', '2 bis rue charles bernard 94290 villeneuve le roi'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '29-domaine-du-chateau-91380-chilly-mazarin-FINAL.html', '29 domaine du chateau 91380 chilly mazarin'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '34-rue-helene-boucher-91300-massy-FINAL.html', '34 rue helene boucher 91300 massy'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '37-rue-des-cigognes-91380-chilly-mazarin-FINAL.html', '37 rue des cigognes 91380 chilly mazarin'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '41-rue-du-four-a-pain-91160-longjumeau-FINAL.html', '41 rue du four a pain 91160 longjumeau'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '50-avenue-saint-marc-massy-91300-FINAL.html', '50 avenue saint marc massy 91300'),
  ('79e4e432-2232-4d2c-b41d-8c7c907c4dec', '84-rue-du-president-francois-mitterrand-91160-longjumeau-FINAL.html', '84 rue du president francois mitterrand 91160 longjumeau')
on conflict (filename) do nothing;
