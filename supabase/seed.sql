-- ============================================================
-- seed.sql — Development seed data for local Supabase
--
-- Derived from real April 2026 source data:
--   data/billing_april_2026.xlsx + data/stripe_2026_ytd.csv
-- Full analysis: docs/data-april-2026.md
--
-- Run with: supabase db reset  (applies migrations then this file)
-- ⚠ NOT for production — use the Python engine to write prod data.
-- ============================================================

-- ── 1. Period ─────────────────────────────────────────────────────────────────

INSERT INTO periods (period_label, start_date, end_date, is_closed) VALUES
  ('April 2026', '2026-04-01', '2026-04-30', false);

-- ── 2. Clients ────────────────────────────────────────────────────────────────
-- 53 records from client-data-base.xlsx + 1 extra (cus_Mk1E5riYx9BQSb, REFUNDED exception)

INSERT INTO clients (stripe_id, display_name, primary_email, account_status, batch, google_id, accounts, is_active, deactivated_month, start_date) VALUES

-- BATCH 1
('cus_Gks5Luf2oz80Vv', 'WIM Group',              'wsinmotion@gmail.com',            'ACTIVE', '1', '340-667-9925', ARRAY['WIM - All Time Trading','WIM - Wholesale Sock Deals','WIM - You Love Organic'], true, null, null),
('cus_GNUYupp8Hh4cSP', 'KTM Twins',              'taryn@ncyyamaha.com',             'ACTIVE', '1', '649-947-9595', ARRAY['ktmtwins.com'],               true, null, null),
('cus_IMNaYfltkdPXuv', 'McKinley Leather',        'info@mckinleyleather.com',        'ACTIVE', '1', '443-743-0284', ARRAY['mckinleyleather.com'],         true, null, null),
('cus_JR5mL46ckKKJiR', 'Just Men''s Shoes',       'sales@justmenshoes.com',          'ACTIVE', '1', '300-423-8601', ARRAY['justmenshoes.com'],            true, null, null),
('cus_L4vWBzInyrA8RN', 'Your Elegant Bar',        'bsingh@yourelegantbar.com',       'ACTIVE', '1', '871-387-6103', ARRAY['yourelegantbar.com'],          true, null, null),
('cus_MjtOD8HI7vVrzm', 'The Positive Christian',  'ckloan@gmail.com',                'ACTIVE', '1', '362-249-0196', ARRAY['thepositivechristian.com'],    true, null, null),
('cus_RnWyNOxHOXVL3t', 'J Devlin Glass Art',      'shalligan@jdevlinglassart.com',   'ACTIVE', '1', '923-161-0221', ARRAY['jdevlinglassart.com'],         true, null, null),
('cus_Q1nzEwQxTHo44M', 'The Squire Shop',         'april@shopsquireshop.com',        'ACTIVE', '1', '526-865-7281', ARRAY['shopsquireshop.com'],          true, null, null),

-- BATCH 2
('cus_EJMKHEPaZ23L9y', 'Mouldings / White River', 'renriquez@whiteriver.com',        'ACTIVE', '2', '842-648-8421', ARRAY['mouldings.com'],               true, null, null),
('cus_HN0odgEcZ6VkPR', 'Mary J Skin',             'hello@maryjskin.net',             'ACTIVE', '2', '338-192-2941', ARRAY['maryjskin.net'],               true, null, null),
('cus_HOlII80xvF057s', 'Pillar Styles',            'spells77@gmail.com',              'ACTIVE', '2', '863-376-9880', ARRAY['pillarstyles.com'],            true, null, null),
('cus_HR1JG8drEbsyIx', 'Athletico Gear',           'jbrown@athleticogear.com',        'ACTIVE', '2', '603-855-8382', ARRAY['athleticogear.com'],           true, null, null),
('cus_LF3m2e8OrXMsUK', 'pureSCRUBS',              'sv@purescrubs.com',               'ACTIVE', '2', '822-002-1798', ARRAY['purescrubs.com'],              true, null, null),
('cus_M6Ex2LIAHaqE31', 'Ear Mall',                 'chrishuddleston566@gmail.com',    'ACTIVE', '2', '753-500-8938', ARRAY['earmall.com'],                 true, null, null),
('cus_QUbjD69JAUgYEI', 'Dallas Designer Handbags', 'accounts@dallasdesignerhandbags.com', 'ACTIVE', '2', '562-623-1101', ARRAY['dallasdesignerhandbags.com'], true, null, null),
('cus_TyLzeArSBSoOIM', 'Tanceuticals',             'gregpetriekis@yahoo.com',         'ACTIVE', '2', '976-247-0644', ARRAY['tanceuticals.com'],            true, null, null),

-- BATCH 3
('cus_L7b1kOJY2PJeOW', 'AdMore Lighting',          'david@admorelighting.com',        'ACTIVE', '3', '417-571-0383', ARRAY['admorelighting.com'],          true, null, null),
('cus_HWgmu82x3l9rCZ', 'Designer Frames Outlet',   'albert.dfo@gmail.com',            'ACTIVE', '3', '949-658-9180', ARRAY['Designerframesoutlet.com'],    true, null, null),
('cus_KpAN7dkWaFdz3B', 'Simply Inspired Goods',    'mike@simplyinspiredgoods.com',    'LOST',   '3', null,           ARRAY['simplyinspiredgoods.com'],     false, '2026-04', null),
('cus_LKim7EZYOVj9jF', 'Quilted Joy',              'angela@quiltedjoy.com',           'ACTIVE', '3', '699-862-2686', ARRAY['quiltedjoy.com'],              true, null, null),
('cus_LpoMNpDjbzi6fz', 'Pops Corn',                'lonnie@popscorn.com',             'ACTIVE', '3', '321-590-3425', ARRAY['popscorn.com'],                true, null, null),
('cus_Ouw9vXPsi6rIp5', 'Rag & Bone Bindery',       'ilira@ragandbonebindery.com',     'ACTIVE', '3', '208-524-9008', ARRAY['ragandbonebindery.com'],       true, null, null),
('cus_PInUMrDJgQWDKt', 'NY Spice Shop',            'nyspiceshop@gmail.com',           'ACTIVE', '3', '404-344-5221', ARRAY['nyspiceshop.com'],             true, null, null),
('cus_PIpVQvQrcL0N9x', 'Gongs Unlimited',           'takk@gongs-unlimited.com',        'ACTIVE', '3', '103-105-7748', ARRAY['gongs-unlimited.com'],         true, null, null),
('cus_PldCRQBIaCoGiO', 'JRG Supply',               'challigan@jrgsupply.com',         'ACTIVE', '3', '719-331-3341', ARRAY['jrgsupply.com'],               true, null, null),
('cus_PwTdKcMGMbuEIv', 'Emma Lou''s Boutique',     'paul@rushapparel.com',            'ACTIVE', '3', '954-760-2364', ARRAY['Emma Lous Boutique'],          true, null, null),
('cus_PO1KaeaHsr0gzb', 'Poker Chips',              'dcampbell@chipco.com',            'ACTIVE', '3', '765-518-5119', ARRAY['pokerchips.com'],              true, null, null),
('cus_ODTpkZCeWeIqPF', 'Bird Supplies',            'birdsupplies@gmail.com',          'ACTIVE', '3', '434-220-0150', ARRAY['birdsupplies.com'],            true, null, null),

-- BATCH SUBSCRIPTION
('cus_OmyL3eKyTwAn7O', 'accounts@alisonsmontessori.com', 'accounts@alisonsmontessori.com', 'ACTIVE', 'SUBSCRIPTION', null, ARRAY['accounts@alisonsmontessori.com'], true, null, null),
('cus_HMwHt2FOxWLy8x', 'Rings By Lux',             'ringsbylux@gmail.com',            'ACTIVE', 'SUBSCRIPTION', '836-943-6790', ARRAY['ringsbylux.com'],  true, null, null),
('cus_MBlqclhGkaWbp7', 'Skips Garage',             'ken@skipsgarage.com',             'ACTIVE', 'SUBSCRIPTION', null, ARRAY['skipsgarage.com'],            true, null, null),
('cus_NHEkhkK5qPmO8o', 'High Cotton Ties',          'peter@highcottonties.com',        'ACTIVE', 'SUBSCRIPTION', '916-153-2155', ARRAY['highcottonties.com'], true, null, null),
('cus_NzutB5xP7tpKlr', 'TrackmateGPS',             'andrew@creativeavocado.io',       'ACTIVE', 'SUBSCRIPTION', null, ARRAY['trackmategps.com'],           true, null, null),
('cus_OuwrMB5A8wG0Tm', 'Pedi Pocket Blanket',       'katherin@pedipocketblanket.com',  'ACTIVE', 'SUBSCRIPTION', null, ARRAY['pedipocketblanket.com'],      true, null, null),
('cus_Oz1JPWE4Uew8XA', 'Vital Wise Shop',           'business@vitalwiseshop.com',      'ACTIVE', 'SUBSCRIPTION', null, ARRAY['vitalwiseshop.com'],          true, null, null),
('cus_PyNx1GjDB2FRJh', 'Bean Goods',               'claire@beangoods.com',            'ACTIVE', 'SUBSCRIPTION', null, ARRAY['beangoods.com'],              true, null, null),
('cus_Q6Hm4ikzgMKpLU', 'slavik@bellaphytologic.com', 'slavik@bellaphytologic.com',    'ACTIVE', 'SUBSCRIPTION', null, ARRAY['slavik@bellaphytologic.com'], true, null, null),
('cus_QhMNKJ23jRrM3E', 'angie@bobodesignstudio.com', 'angie@bobodesignstudio.com',    'ACTIVE', 'SUBSCRIPTION', null, ARRAY['angie@bobodesignstudio.com'], true, null, null),
('cus_Rgkuafb4zbdprf', 'abby@vivianlou.com',        'abby@vivianlou.com',              'ACTIVE', 'SUBSCRIPTION', null, ARRAY['abby@vivianlou.com'],         true, null, null),
('cus_SFWU1lLTiWM73N', 'gcypher@cypherpickleball.com', 'gcypher@cypherpickleball.com', 'ACTIVE', 'SUBSCRIPTION', null, ARRAY['gcypher@cypherpickleball.com'], true, null, null),
('cus_SFxQJAm3hkdcEZ', 'webstore@laeducativapr.com', 'webstore@laeducativapr.com',    'ACTIVE', 'SUBSCRIPTION', null, ARRAY['webstore@laeducativapr.com'], true, null, null),
('cus_Sgavq2Eogudl9V', 'hill3312@gmail.com',        'hill3312@gmail.com',              'ACTIVE', 'SUBSCRIPTION', null, ARRAY['hill3312@gmail.com'],         true, null, null),

-- BATCH 5
('cus_L7DrHmiMofn6ws', 'Beehive Handmade',          'sandra@beehivehandmade.com',      'ACTIVE', '5', null, ARRAY['beehivehandmade.com'],                  true, null, null),
('cus_LS8xakJItjgXhd', 'Sugarbee Clothing',         'hello@sugarbeeclothing.com',      'ACTIVE', '5', null, ARRAY['sugarbeeclothing.com'],                 true, null, null),
('cus_Mql0N9LiRyQDMW', 'Jewelry by Bretta',         'bretta@jewelrybybretta.com',      'ACTIVE', '5', null, ARRAY['jewelrybybretta.com'],                  true, null, null),

-- CONSULTING
('cus_Q14kHfVtV7mClW', 'sgilly@trility.net',        'sgilly@trility.net',              'ACTIVE', 'Consulting', null, ARRAY['sgilly@trility.net'],           true, null, null),
('cus_SGRkJV1CrZMq0b', 'tiradoalejandra.18@gmail.com', 'tiradoalejandra.18@gmail.com', 'ACTIVE', 'Consulting', null, ARRAY['tiradoalejandra.18@gmail.com'], true, null, null),
('cus_RyRxOBvhJBvNpE', 'ppucheu@pbm-solutions.com', 'ppucheu@pbm-solutions.com',       'ACTIVE', 'Consulting', null, ARRAY['ppucheu@pbm-solutions.com'],    true, null, '2026-04-01'),
('cus_UJPVLKVt2c4Oh3', 'richie@natcodb.com',        'richie@natcodb.com',              'ACTIVE', 'Consulting', null, ARRAY['richie@natcodb.com'],           true, null, '2026-04-01'),
('cus_THezY3L1GTPWXk', 'eduardo@caribbeanrealty.com', 'eduardo@caribbeanrealty.com',   'ACTIVE', 'Consulting', null, ARRAY['eduardo@caribbeanrealty.com'],  true, null, null),
('cus_UEAMptExozOqFW', 'mateo@usframefactory.com',  'mateo@usframefactory.com',        'ACTIVE', 'Consulting', null, ARRAY['mateo@usframefactory.com'],     true, null, null),
(null,                  'margaret@lblegalnurses.com', 'margaret@lblegalnurses.com',     'ACTIVE', 'Consulting', null, ARRAY['margaret@lblegalnurses.com'],   true, null, null),

-- MULTIPLE
('cus_MAQFq6FlG4sGc3', 'Real Estate Posts / Hall Signs', 'mkeleher@proveli.com',       'ACTIVE', 'Multiple', null, ARRAY['realestateposts.com','addressesofdistinction.com','hallsigns.com'], true, null, null),
('cus_OinjM3GcjQrwhs', 'Cheap Dealer Supplies',     'brandon@seibertventures.com',     'ACTIVE', 'Multiple', '152-908-0367', ARRAY['cheapdealersupplies.com','cheapdealersupplies.com (Amazon)'], true, null, null),

-- Extra: REFUNDED charge — no AR row, surfaces as exception
('cus_Mk1E5riYx9BQSb', 'gregpetriekis (refund)',    'gregpetriekis@yahoo.com',         'INACTIVE', '—', null, ARRAY[]::text[], false, null, null);


-- ── 3. Billing plans ──────────────────────────────────────────────────────────
-- One plan per client (current state as of April 2026)
-- Using subquery to resolve client_id from stripe_id

INSERT INTO client_billing_plans
  (client_id, billing_plan, billing_details, billing_pct, billing_day, notes, projection_type, projection_amount, effective_from, effective_to)
VALUES

-- BATCH 1
((SELECT id FROM clients WHERE stripe_id = 'cus_Gks5Luf2oz80Vv'),
  'Advanced Accounts - Custom Pricing',
  'Fix fee $1,000 + 10% of Ad Spend from previous month for Google and Bing',
  10, 1, 'Manually — charge $1,000 every Monday — Invoice in Harvest',
  'LAST_PERIOD', 4000.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_GNUYupp8Hh4cSP'),
  'Advanced Accounts - Custom Pricing',
  'Charge 12% of ad spend from previous month for AdWords and Bing — varies monthly',
  12, 1, 'Manually — charge % of Campaign COST not REVENUE',
  'LAST_PERIOD', 1501.98, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_IMNaYfltkdPXuv'),
  'Google Shop+Google Ads+DFW',
  'Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021) + $20 DFW',
  2, 1, null,
  'ROLLING_3', 512.40, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_JR5mL46ckKKJiR'),
  'Google Shop+Google ads+DFW',
  'Google Shopping + Text Ads - $320/mo + 2% revenue + Bing $100/mo + 2% revenue + DFW',
  2, 1, 'Add DFW (10,000+ products). Take 2% from ''JMS Brands'' but not ''Brand Terms''.',
  'ROLLING_3', 1545.60, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_L4vWBzInyrA8RN'),
  'Google Shop+Google Ads',
  'Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021)',
  2, 1, 'Filter out Brand Text Ads',
  'ROLLING_3', 1746.95, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_MjtOD8HI7vVrzm'),
  'Google Shop+Google Ads',
  'Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021)',
  2, 1, null,
  'ROLLING_3', 552.19, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_RnWyNOxHOXVL3t'),
  'Google Shop+Google Ads+DFW',
  'Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021) + DFW',
  2, 1, null,
  'ROLLING_3', 834.09, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_Q1nzEwQxTHo44M'),
  'Google Shop+DFW',
  'Google Shopping - $299 + 2% of ad revenue + $20 DFW',
  2, 1, 'Add $20 DFW',
  'ROLLING_3', 299.00, '2026-01-01', null),

-- BATCH 2
((SELECT id FROM clients WHERE stripe_id = 'cus_EJMKHEPaZ23L9y'),
  'Google Shop+Google Ads+DFW',
  'Google Shopping + Text Ads - $349 + 2% of ad revenue (OLD) + $40 variable DFW (2 stores)',
  2, 1, 'Mouldings & White River same invoice. Add $40 DFW 2 stores. Filter brand text ads.',
  'ROLLING_3', 4001.50, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_HN0odgEcZ6VkPR'),
  'Google Shop+Google Ads',
  'Google Shopping + Text Ads - $349 + 2% of ad revenue (OLD)',
  2, 1, null,
  'ROLLING_3', 356.11, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_HOlII80xvF057s'),
  'Google Shop+DFW',
  'Google Shopping - $199 + 2% of ad revenue + $20 DFW',
  2, 1, null,
  'ROLLING_3', 279.58, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_HR1JG8drEbsyIx'),
  'Google Shop+DFW',
  'Google Shopping - $299 + 2% of ad revenue + $20 DFW',
  2, 1, 'Filter out non-ED Pmax campaign & charge $20 DFW',
  'ROLLING_3', 509.83, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_LF3m2e8OrXMsUK'),
  'Google Shop',
  'Google Shopping - $299 + 2% of ad revenue',
  2, 1, 'Smart campaign is not ours — filter out',
  'ROLLING_3', 334.02, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_M6Ex2LIAHaqE31'),
  'Google Shop',
  'Google Shopping - $199 + 2% of ad revenue',
  2, 1, null,
  'ROLLING_3', 309.95, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_QUbjD69JAUgYEI'),
  'Google Shop+Google Ads+BING+DFW',
  'Google Shopping, Bing Shopping, Text Ads & Remarketing - $399 + 2% of ad revenue',
  2, 1, 'Add DFW — figure every month due to higher product count',
  'ROLLING_3', 1772.75, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_TyLzeArSBSoOIM'),
  'Google Shop',
  'Google Shopping - $299 + 2% of ad revenue',
  2, 1, 'Filter out non-ED and Shopping Brand ads',
  'ROLLING_3', 518.88, '2026-01-01', null),

-- BATCH 3
((SELECT id FROM clients WHERE stripe_id = 'cus_L7b1kOJY2PJeOW'),
  'Google Shop+Google Ads',
  'Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021)',
  2, 1, null,
  'ROLLING_3', 548.93, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_HWgmu82x3l9rCZ'),
  'Google Shop+Google Ads+BING',
  'Google & Bing - $399/month + 0.5% of revenue (Shopping only, not Brand)',
  0.5, 20, null,
  'ROLLING_3', 4001.26, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_KpAN7dkWaFdz3B'),
  'Google Shopping Starter Plan',
  'Google Shopping Management Starter Plan - $320.86/month',
  0, null, 'LOST — account marked inactive',
  'FIXED', 320.86, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_LKim7EZYOVj9jF'),
  'Google Shop+Google Ads+BING+DFW',
  'Google Shopping & Bing Shopping - $399 + 2% of ad revenue',
  2, 20, null,
  'ROLLING_3', 1450.51, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_LpoMNpDjbzi6fz'),
  'Google Shop+Google Ads+DFW',
  'Google Shopping - $199 + 2% of ad revenue (text ads Brand only)',
  2, 20, 'Text ads are Brand only — no revenue % or monthly mgmt fee',
  'ROLLING_3', 489.79, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_Ouw9vXPsi6rIp5'),
  'Google Shop+DFW',
  'Google Shopping - $199 + 2% of ad revenue + $20 DFW',
  2, 20, 'Charge DFW. Text ads branded only — no revenue % or mgmt fee',
  'ROLLING_3', 441.27, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_PInUMrDJgQWDKt'),
  'Google Shop',
  'Google Shopping - $299 + 2% of ad revenue',
  2, 20, null,
  'ROLLING_3', 801.98, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_PIpVQvQrcL0N9x'),
  'Google Shop+Google Ads',
  'Google Shopping + Text Ads - $399 + 2% of ad revenue (NEW 2021)',
  2, 20, 'Filter out ''ED | Search | Brand'' for text ads but take revenue from rest',
  'ROLLING_3', 3960.06, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_PldCRQBIaCoGiO'),
  'Google Growth Plan',
  'Google Shopping Management Growth Plan - $650/month + 2% of revenue',
  2, 20, null,
  'ROLLING_3', 2098.88, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_PwTdKcMGMbuEIv'),
  'Google Growth Plan',
  'Google Shopping Management Growth Plan - $650/month + 2% of revenue',
  2, 20, null,
  'ROLLING_3', 1314.22, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_PO1KaeaHsr0gzb'),
  'Google Shop+Google Ads',
  'Google Shopping & Text Ads - $399/month + 2% of ad revenue',
  2, 1, 'Filter out ''Custom Poker Chips'' for text ads',
  'ROLLING_3', 399.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_ODTpkZCeWeIqPF'),
  'Google Shop',
  'Google Shopping - $299 + 2% of ad revenue',
  2, 20, null,
  'ROLLING_3', 299.00, '2026-01-01', null),

-- SUBSCRIPTION
((SELECT id FROM clients WHERE stripe_id = 'cus_OmyL3eKyTwAn7O'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 1, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_HMwHt2FOxWLy8x'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475',
  0, 8, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_MBlqclhGkaWbp7'),
  'Amazon Plan', 'Amazon Ad Management - $399/month flat rate',
  0, 1, 'Same Customer ID as Tailgate Pro', 'FIXED', 399.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_NHEkhkK5qPmO8o'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475',
  0, 8, 'Only Google base fee', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_NzutB5xP7tpKlr'),
  'Amazon Plan', 'Flat monthly rate for Amazon $475',
  0, 1, 'Not a WIM Group — see Gabriel''s email for payment plan', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_OuwrMB5A8wG0Tm'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 8, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_Oz1JPWE4Uew8XA'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, null, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_PyNx1GjDB2FRJh'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 7, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_Q6Hm4ikzgMKpLU'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 1, 'AUTOMATIC — missing from client DB, add Stripe ID', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_QhMNKJ23jRrM3E'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 1, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_Rgkuafb4zbdprf'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 31, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_SFWU1lLTiWM73N'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 4, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_SFxQJAm3hkdcEZ'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 4, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_Sgavq2Eogudl9V'),
  'Google Shopping Starter Plan', 'Google Shopping Management Starter Plan - $475/month',
  0, 15, 'AUTOMATIC', 'FIXED', 475.00, '2026-01-01', null),

-- BATCH 5
((SELECT id FROM clients WHERE stripe_id = 'cus_L7DrHmiMofn6ws'),
  'Coaching', 'Google Shopping Setup + Coaching - Monthly Fee $299',
  0, 7, null, 'FIXED', 299.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_LS8xakJItjgXhd'),
  'Coaching', 'Google Shopping Setup + Coaching - Monthly Fee $299 (billed $598 Apr 2026 — verify split)',
  0, 6, null, 'FIXED', 598.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_Mql0N9LiRyQDMW'),
  'Coaching', 'Google Shopping Setup + Coaching - Monthly Fee $299 (billed $598 Apr 2026 — verify split)',
  0, 28, null, 'FIXED', 598.00, '2026-01-01', null),

-- CONSULTING
((SELECT id FROM clients WHERE stripe_id = 'cus_Q14kHfVtV7mClW'),
  'Advanced Accounts - Custom Pricing', 'Custom. Billed by Gabriel',
  0, 1, null, 'LAST_PERIOD', 9900.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_SGRkJV1CrZMq0b'),
  'Social Media Plan', 'Social Media Management — variable monthly',
  0, 4, null, 'LAST_PERIOD', 1130.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_RyRxOBvhJBvNpE'),
  'Advanced Accounts - Custom Pricing', 'Custom consulting — variable (missing from client DB, add record)',
  0, null, null, 'LAST_PERIOD', 3550.00, '2026-04-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_UJPVLKVt2c4Oh3'),
  'Advanced Accounts - Custom Pricing', 'Custom retainer — $1,500/month (April 2026 had $3,500 setup fee — one-time)',
  0, 2, 'April: AR $1,500 vs Stripe $3,500 — likely onboarding fee. Verify with Gabriel.',
  'MANUAL', 1500.00, '2026-04-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_THezY3L1GTPWXk'),
  'Advanced Accounts - Custom Pricing', 'Fix Fee $800/month',
  0, 22, null, 'FIXED', 800.00, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_UEAMptExozOqFW'),
  'Advanced Accounts - Custom Pricing', 'Custom — amount TBD',
  0, 27, null, 'LAST_PERIOD', null, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id IS NULL AND primary_email = 'margaret@lblegalnurses.com'),
  'Advanced Accounts - Custom Pricing', 'Custom — no Stripe ID, manual invoice (add Stripe ID to billing sheet)',
  0, 2, null, 'LAST_PERIOD', 1500.00, '2026-01-01', null),

-- MULTIPLE
((SELECT id FROM clients WHERE stripe_id = 'cus_MAQFq6FlG4sGc3'),
  'Google Shop+Google Ads+BING',
  '$399 flat (REP) + $399 + 2% revenue (Hall Signs) + $399 + 2% (AOD)',
  2, 1, '3 sub-accounts on one invoice — Real Estate Posts, Addresses of Distinction, Hall Signs',
  'ROLLING_3', 1391.64, '2026-01-01', null),

((SELECT id FROM clients WHERE stripe_id = 'cus_OinjM3GcjQrwhs'),
  'Google Shop+DFW + Amazon Plan',
  'Google Shopping - $299 + 2% revenue + $20 DFW + Amazon $475/month',
  2, 20, 'Add $20 DFW — no charge for text ads',
  'ROLLING_3', 1082.17, '2026-01-01', null);

-- ── 4. Reconciliation results — April 2026 ────────────────────────────────────
-- Source: app/lib/mock/april-2026.ts (45 rows)
-- Grain: (period_label, stripe_id)

INSERT INTO reconciliation_results
  (period_label, stripe_id, expected_amount, collected_amount, variance, recon_status, display_name, primary_email, batch, account_status, paid_net_count)
VALUES

-- MATCH (35)
('April 2026', 'cus_EJMKHEPaZ23L9y', 4001.50, 4001.50,    0.00, 'MATCH', 'mouldings.com',                    'renriquez@whiteriver.com',            '2',            'ACTIVE', 1),
('April 2026', 'cus_GNUYupp8Hh4cSP', 1501.98, 1501.98,    0.00, 'MATCH', 'ktmtwins.com',                     'taryn@ncyyamaha.com',                  '1',            'ACTIVE', 1),
('April 2026', 'cus_Gks5Luf2oz80Vv', 4000.00, 4000.00,    0.00, 'MATCH', 'WIM - alltimetrading.com',         'wsinmotion@gmail.com',                 '1',            'ACTIVE', 1),
('April 2026', 'cus_HMwHt2FOxWLy8x',  475.00,  475.00,    0.00, 'MATCH', 'ringsbylux.com',                   'ringsbylux@gmail.com',                 'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_HN0odgEcZ6VkPR',  356.11,  356.11,    0.00, 'MATCH', 'maryjskin.net',                    'hello@maryjskin.net',                  '2',            'ACTIVE', 1),
('April 2026', 'cus_HOlII80xvF057s',   279.58,  279.58,    0.00, 'MATCH', 'pillarstyles.com',                 'spells77@gmail.com',                   '2',            'ACTIVE', 1),
('April 2026', 'cus_HR1JG8drEbsyIx',   509.83,  509.83,    0.00, 'MATCH', 'athleticogear.com',                'jbrown@athleticogear.com',             '2',            'ACTIVE', 1),
('April 2026', 'cus_HWgmu82x3l9rCZ', 4001.26, 4001.26,    0.00, 'MATCH', 'Designerframesoutlet.com',         'albert.dfo@gmail.com',                 '3',            'ACTIVE', 1),
('April 2026', 'cus_IMNaYfltkdPXuv',   512.40,  512.40,    0.00, 'MATCH', 'mckinleyleather.com',              'info@mckinleyleather.com',             '1',            'ACTIVE', 1),
('April 2026', 'cus_JR5mL46ckKKJiR', 1545.60, 1545.60,    0.00, 'MATCH', 'justmenshoes.com',                 'sales@justmenshoes.com',               '1',            'ACTIVE', 1),
('April 2026', 'cus_KpAN7dkWaFdz3B',   320.86,  320.86,    0.00, 'MATCH', 'simplyinspiredgoods.com',          'mike@simplyinspiredgoods.com',         '3',            'LOST',   1),
('April 2026', 'cus_L4vWBzInyrA8RN', 1746.95, 1746.95,    0.00, 'MATCH', 'yourelegantbar.com',               'bsingh@yourelegantbar.com',            '1',            'ACTIVE', 1),
('April 2026', 'cus_L7b1kOJY2PJeOW',   548.93,  548.93,    0.00, 'MATCH', 'admorelighting.com',               'david@admorelighting.com',             '2',            'ACTIVE', 1),
('April 2026', 'cus_LF3m2e8OrXMsUK',   334.02,  334.02,    0.00, 'MATCH', 'purescrubs.com',                   'sv@purescrubs.com',                    '2',            'ACTIVE', 1),
('April 2026', 'cus_LKim7EZYOVj9jF', 1450.51, 1450.51,    0.00, 'MATCH', 'quiltedjoy.com',                   'angela@quiltedjoy.com',                '3',            'ACTIVE', 1),
('April 2026', 'cus_LpoMNpDjbzi6fz',   489.79,  489.79,    0.00, 'MATCH', 'popscorn.com',                     'lonnie@popscorn.com',                  '3',            'ACTIVE', 1),
('April 2026', 'cus_MAQFq6FlG4sGc3', 1391.64, 1391.64,    0.00, 'MATCH', 'realestateposts.com',              'mkeleher@proveli.com',                 'Multiple',     'ACTIVE', 1),
('April 2026', 'cus_MBlqclhGkaWbp7',   399.00,  399.00,    0.00, 'MATCH', 'skipsgarage.com',                  'ken@skipsgarage.com',                  'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_MjtOD8HI7vVrzm',   552.19,  552.19,    0.00, 'MATCH', 'thepositivechristian.com',         'ckloan@gmail.com',                     '1',            'ACTIVE', 1),
('April 2026', 'cus_NHEkhkK5qPmO8o',   475.00,  475.00,    0.00, 'MATCH', 'highcottonties.com',               'peter@highcottonties.com',             'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_OinjM3GcjQrwhs', 1082.17, 1082.17,    0.00, 'MATCH', 'cheapdealersupplies.com',          'brandon@seibertventures.com',          'Multiple',     'ACTIVE', 1),
('April 2026', 'cus_Ouw9vXPsi6rIp5',   441.27,  441.27,    0.00, 'MATCH', 'ragandbonebindery.com',            'ilira@ragandbonebindery.com',          '3',            'ACTIVE', 1),
('April 2026', 'cus_OuwrMB5A8wG0Tm',   475.00,  475.00,    0.00, 'MATCH', 'pedipocketblanket.com',            'katherin@pedipocketblanket.com',       'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_PInUMrDJgQWDKt',   801.98,  801.98,    0.00, 'MATCH', 'nyspiceshop.com',                  'nyspiceshop@gmail.com',                '3',            'ACTIVE', 1),
('April 2026', 'cus_PIpVQvQrcL0N9x', 3960.06, 3960.05,   -0.01, 'MATCH', 'gongs-unlimited.com',              'takk@gongs-unlimited.com',             '3',            'ACTIVE', 1),
('April 2026', 'cus_PldCRQBIaCoGiO', 2098.88, 2098.88,    0.00, 'MATCH', 'jrgsupply.com',                    'challigan@jrgsupply.com',              '3',            'ACTIVE', 1),
('April 2026', 'cus_PwTdKcMGMbuEIv', 1314.22, 1314.22,    0.00, 'MATCH', 'Emma Lous Boutique',               'paul@rushapparel.com',                 '3',            'ACTIVE', 1),
('April 2026', 'cus_PyNx1GjDB2FRJh',   475.00,  475.00,    0.00, 'MATCH', 'beangoods.com',                    'claire@beangoods.com',                 'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_Q14kHfVtV7mClW', 9900.00, 9900.00,    0.00, 'MATCH', 'sgilly@trility.net',               'sgilly@trility.net',                   'Consulting',   'ACTIVE', 1),
('April 2026', 'cus_Q6Hm4ikzgMKpLU',   475.00,  475.00,    0.00, 'MATCH', 'slavik@bellaphytologic.com',       'slavik@bellaphytologic.com',           'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_QUbjD69JAUgYEI', 1772.75, 1772.75,    0.00, 'MATCH', 'dallasdesignerhandbags.com',       'accounts@dallasdesignerhandbags.com',  '2',            'ACTIVE', 1),
('April 2026', 'cus_QhMNKJ23jRrM3E',   475.00,  475.00,    0.00, 'MATCH', 'angie@bobodesignstudio.com',       'angie@bobodesignstudio.com',           'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_SFWU1lLTiWM73N',   475.00,  475.00,    0.00, 'MATCH', 'gcypher@cypherpickleball.com',     'gcypher@cypherpickleball.com',         'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_Sgavq2Eogudl9V',   475.00,  475.00,    0.00, 'MATCH', 'hill3312@gmail.com',               'hill3312@gmail.com',                   'SUBSCRIPTION', 'ACTIVE', 1),
('April 2026', 'cus_TyLzeArSBSoOIM',   518.88,  518.89,    0.01, 'MATCH', 'tanceuticals.com',                 'gregpetriekis@yahoo.com',              '2',            'ACTIVE', 1),

-- OVERPAID (1)
('April 2026', 'cus_OmyL3eKyTwAn7O',   475.00,  650.00,  175.00, 'OVERPAID', 'accounts@alisonsmontessori.com', 'accounts@alisonsmontessori.com', 'SUBSCRIPTION', 'ACTIVE', 1),

-- FAILED_HARD (2)
('April 2026', 'cus_RnWyNOxHOXVL3t',   834.09,    0.00, -834.09, 'FAILED_HARD', 'jdevlinglassart.com', 'shalligan@jdevlinglassart.com', '1', 'ACTIVE', 0),
('April 2026', 'cus_M6Ex2LIAHaqE31',   309.95,    0.00, -309.95, 'FAILED_HARD', 'earmall.com',          'chrishuddleston566@gmail.com',  '2', 'ACTIVE', 0),

-- MISSING_PAYMENT (3)
('April 2026', 'cus_LS8xakJItjgXhd',   598.00,    0.00, -598.00, 'MISSING_PAYMENT', 'sugarbeeclothing.com', 'hello@sugarbeeclothing.com', '5', 'ACTIVE', 0),
('April 2026', 'cus_Mql0N9LiRyQDMW',   598.00,    0.00, -598.00, 'MISSING_PAYMENT', 'jewelrybybretta.com',  'bretta@jewelrybybretta.com', '5', 'ACTIVE', 0),
('April 2026', 'cus_L7DrHmiMofn6ws',   299.00,    0.00, -299.00, 'MISSING_PAYMENT', 'beehivehandmade.com',  'sandra@beehivehandmade.com', '5', 'ACTIVE', 0),

-- STRIPE_ONLY (4) — no AR row or missing Stripe ID in billing sheet
('April 2026', 'cus_SGRkJV1CrZMq0b',     0.00, 1130.00, 1130.00, 'STRIPE_ONLY', 'tiradoalejandra.18@gmail.com', 'tiradoalejandra.18@gmail.com', 'Consulting', 'ACTIVE', 1),
('April 2026', 'cus_RyRxOBvhJBvNpE',     0.00, 3550.00, 3550.00, 'STRIPE_ONLY', 'ppucheu@pbm-solutions.com',    'ppucheu@pbm-solutions.com',    'Consulting', 'ACTIVE', 1),
('April 2026', 'cus_UJPVLKVt2c4Oh3',     0.00, 3500.00, 3500.00, 'STRIPE_ONLY', 'richie@natcodb.com',           'richie@natcodb.com',           'Consulting', 'ACTIVE', 1),
-- margaret — no Stripe ID (stripe_id left NULL)
('April 2026', null,                      0.00, 1500.00, 1500.00, 'STRIPE_ONLY', 'margaret@lblegalnurses.com',   'margaret@lblegalnurses.com',   'Consulting', 'ACTIVE', 1);


-- ── 5. Exceptions — April 2026 (10 open) ─────────────────────────────────────

INSERT INTO exceptions
  (period_label, stripe_id, result_id, exception_type, expected_amount, collected_amount, variance, display_name, primary_email, batch, resolution_status, resolution_note)
VALUES

('April 2026', 'cus_RnWyNOxHOXVL3t',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_RnWyNOxHOXVL3t'),
  'FAILED_HARD', 834.09, 0.00, -834.09, 'jdevlinglassart.com', 'shalligan@jdevlinglassart.com', '1', 'OPEN',
  '4x insufficient_funds. Contact client to update payment method.'),

('April 2026', 'cus_M6Ex2LIAHaqE31',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_M6Ex2LIAHaqE31'),
  'FAILED_HARD', 309.95, 0.00, -309.95, 'earmall.com', 'chrishuddleston566@gmail.com', '2', 'OPEN',
  'previously_declined_do_not_retry + incorrect_number. Card may be cancelled.'),

('April 2026', 'cus_LS8xakJItjgXhd',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_LS8xakJItjgXhd'),
  'MISSING_PAYMENT', 598.00, 0.00, -598.00, 'sugarbeeclothing.com', 'hello@sugarbeeclothing.com', '5', 'OPEN',
  'No Stripe activity. Invoice may not have been created. Verify.'),

('April 2026', 'cus_Mql0N9LiRyQDMW',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_Mql0N9LiRyQDMW'),
  'MISSING_PAYMENT', 598.00, 0.00, -598.00, 'jewelrybybretta.com', 'bretta@jewelrybybretta.com', '5', 'OPEN',
  'No Stripe activity. Invoice may not have been created. Verify.'),

('April 2026', 'cus_L7DrHmiMofn6ws',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_L7DrHmiMofn6ws'),
  'MISSING_PAYMENT', 299.00, 0.00, -299.00, 'beehivehandmade.com', 'sandra@beehivehandmade.com', '5', 'OPEN',
  'No Stripe activity. Invoice may not have been created. Verify.'),

('April 2026', 'cus_OmyL3eKyTwAn7O',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_OmyL3eKyTwAn7O'),
  'OVERPAID', 475.00, 650.00, 175.00, 'accounts@alisonsmontessori.com', 'accounts@alisonsmontessori.com', 'SUBSCRIPTION', 'OPEN',
  'Paid $650, expected $475. Likely manual or off-cycle payment. Verify before crediting.'),

('April 2026', 'cus_Mk1E5riYx9BQSb',
  null,
  'REFUNDED', null, null, -518.89, 'cus_Mk1E5riYx9BQSb', 'gregpetriekis@yahoo.com', '—', 'OPEN',
  'Full refund of $518.89 (gregpetriekis@yahoo.com). No AR billing line for this customer.'),

('April 2026', 'cus_SGRkJV1CrZMq0b',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_SGRkJV1CrZMq0b'),
  'STRIPE_ONLY', 0.00, 1130.00, 1130.00, 'tiradoalejandra.18@gmail.com', 'tiradoalejandra.18@gmail.com', 'Consulting', 'OPEN',
  'AR billing has this client ($1,130) but no Stripe ID on the sheet. Add cus_SGRkJV1CrZMq0b to billing sheet — this would resolve as MATCH.'),

('April 2026', 'cus_RyRxOBvhJBvNpE',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_RyRxOBvhJBvNpE'),
  'STRIPE_ONLY', 0.00, 3550.00, 3550.00, 'ppucheu@pbm-solutions.com', 'ppucheu@pbm-solutions.com', 'Consulting', 'OPEN',
  'AR billing has $3,500 expected but no Stripe ID. Stripe shows $3,550 paid. Add cus_RyRxOBvhJBvNpE to billing — OVERPAID $50 if linked.'),

('April 2026', 'cus_UJPVLKVt2c4Oh3',
  (SELECT id FROM reconciliation_results WHERE period_label = 'April 2026' AND stripe_id = 'cus_UJPVLKVt2c4Oh3'),
  'STRIPE_ONLY', 0.00, 3500.00, 3500.00, 'richie@natcodb.com', 'richie@natcodb.com', 'Consulting', 'OPEN',
  'AR shows $1,500 expected, no Stripe ID. Stripe shows $3,500 paid (cus_UJPVLKVt2c4Oh3). Large discrepancy — likely onboarding/setup fee. Verify contract.');
