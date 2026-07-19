// Curated list of major UK towns and cities — powers the Town/City
// autocomplete on signup.html. This is a "soft suggestion" data source, not
// an enforced allowlist: a member can always type something not on this
// list and still sign up (see PLACE_PATTERN validation in server.js for the
// actual security-relevant character restriction). Extend this list any
// time a real member's town turns out to be missing.

const UK_TOWNS = [
  // Greater London
  'London', 'Croydon', 'Bromley', 'Sutton', 'Kingston upon Thames', 'Richmond upon Thames',
  'Harrow', 'Ealing', 'Enfield', 'Barnet', 'Romford', 'Ilford', 'Uxbridge', 'Twickenham', 'Wembley',
  'Rainham', 'Dagenham', 'Hornchurch', 'Upminster', 'Barking',

  // South East
  'Brighton', 'Hove', 'Reading', 'Oxford', 'Southampton', 'Portsmouth', 'Guildford', 'Woking',
  'Basingstoke', 'Maidstone', 'Canterbury', 'Ashford', 'Tunbridge Wells', 'Crawley', 'Horsham',
  'Chichester', 'Winchester', 'Eastbourne', 'Hastings', 'Folkestone', 'Dover', 'Margate', 'Ramsgate',
  'Gravesend', 'Dartford', 'Sevenoaks', 'Milton Keynes', 'Aylesbury', 'High Wycombe', 'Slough',
  'Windsor', 'Bracknell', 'Newbury', 'Andover', 'Farnborough', 'Aldershot', 'Camberley', 'Chertsey',
  'Epsom', 'Redhill', 'Reigate',

  // South West
  'Bristol', 'Bath', 'Exeter', 'Plymouth', 'Gloucester', 'Cheltenham', 'Swindon', 'Salisbury',
  'Taunton', 'Yeovil', 'Bournemouth', 'Poole', 'Weymouth', 'Dorchester', 'Truro', 'Falmouth',
  'Penzance', 'Newquay', 'St Ives', 'Torquay', 'Paignton', 'Barnstaple', 'Bideford', 'Bridgwater',
  'Frome', 'Trowbridge', 'Chippenham', 'Stroud',

  // East of England
  'Cambridge', 'Norwich', 'Ipswich', 'Peterborough', 'Chelmsford', 'Colchester', 'Luton', 'Bedford',
  'St Albans', 'Watford', 'Southend-on-Sea', 'Basildon', 'Harlow', 'Stevenage', 'Hertford',
  'Bury St Edmunds', "King's Lynn", 'Great Yarmouth', 'Lowestoft', 'Ely', 'Huntingdon', 'Wisbech',
  'Braintree', 'Clacton-on-Sea',

  // West Midlands
  'Birmingham', 'Coventry', 'Wolverhampton', 'Walsall', 'West Bromwich', 'Solihull', 'Dudley',
  'Sutton Coldfield', 'Stourbridge', 'Nuneaton', 'Redditch', 'Worcester', 'Kidderminster',
  'Stratford-upon-Avon', 'Warwick', 'Royal Leamington Spa', 'Rugby', 'Telford', 'Shrewsbury', 'Hereford',

  // East Midlands
  'Nottingham', 'Leicester', 'Derby', 'Lincoln', 'Northampton', 'Chesterfield', 'Mansfield',
  'Loughborough', 'Kettering', 'Wellingborough', 'Corby', 'Grantham', 'Newark-on-Trent',

  // Yorkshire and the Humber
  'Leeds', 'Sheffield', 'Bradford', 'Kingston upon Hull', 'York', 'Wakefield', 'Doncaster',
  'Rotherham', 'Barnsley', 'Huddersfield', 'Halifax', 'Harrogate', 'Scarborough', 'Whitby', 'Ripon',
  'Selby', 'Goole', 'Grimsby', 'Scunthorpe',

  // North West
  'Manchester', 'Liverpool', 'Salford', 'Bolton', 'Stockport', 'Oldham', 'Rochdale', 'Bury',
  'Wigan', 'Warrington', 'Preston', 'Blackpool', 'Blackburn', 'Burnley', 'Lancaster', 'Chester',
  'Crewe', 'Macclesfield', 'Southport', 'St Helens', 'Widnes', 'Runcorn', 'Carlisle',
  'Barrow-in-Furness', 'Kendal',

  // North East
  'Newcastle upon Tyne', 'Sunderland', 'Durham', 'Gateshead', 'Middlesbrough', 'Darlington',
  'Hartlepool', 'South Shields', 'North Shields', 'Stockton-on-Tees', 'Redcar', 'Consett',
  'Berwick-upon-Tweed',

  // Scotland
  'Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee', 'Inverness', 'Stirling', 'Perth', 'Paisley',
  'East Kilbride', 'Livingston', 'Hamilton', 'Cumbernauld', 'Kirkcaldy', 'Dunfermline', 'Ayr',
  'Kilmarnock', 'Greenock', 'Falkirk', 'Motherwell', 'Coatbridge', 'Airdrie', 'Dumfries', 'Elgin',
  'Fort William', 'St Andrews', 'Oban', 'Peterhead', 'Fraserburgh', 'Stranraer', 'Galashiels',
  'Hawick', 'Arbroath', 'Montrose', 'Forfar',

  // Wales
  'Cardiff', 'Swansea', 'Newport', 'Wrexham', 'Barry', 'Neath', 'Port Talbot', 'Bridgend',
  'Merthyr Tydfil', 'Cwmbran', 'Pontypridd', 'Caerphilly', 'Llanelli', 'Carmarthen', 'Aberystwyth',
  'Bangor', 'Rhyl', 'Colwyn Bay', 'Conwy', 'Llandudno', 'Holyhead', 'Haverfordwest', 'Pembroke',
  'Milford Haven', 'Newtown', 'Welshpool', 'Brecon', 'Monmouth', 'Chepstow',

  // Northern Ireland
  'Belfast', 'Derry', 'Lisburn', 'Newtownabbey', 'Bangor (NI)', 'Craigavon', 'Castlereagh',
  'Ballymena', 'Newtownards', 'Carrickfergus', 'Coleraine', 'Antrim', 'Larne', 'Omagh',
  'Enniskillen', 'Armagh', 'Dungannon', 'Strabane', 'Downpatrick', 'Newry', 'Portadown',

  // Counties & regions — some members describe where they're based by county
  // rather than by town/city (e.g. "Essex"), so these are included too.
  'Bedfordshire', 'Berkshire', 'Buckinghamshire', 'Cambridgeshire', 'Cheshire', 'Cornwall',
  'County Durham', 'Cumbria', 'Derbyshire', 'Devon', 'Dorset', 'East Sussex', 'Essex',
  'Gloucestershire', 'Hampshire', 'Herefordshire', 'Hertfordshire', 'Isle of Wight', 'Kent',
  'Lancashire', 'Leicestershire', 'Lincolnshire', 'Norfolk', 'North Yorkshire', 'Northamptonshire',
  'Northumberland', 'Nottinghamshire', 'Oxfordshire', 'Rutland', 'Shropshire', 'Somerset',
  'South Yorkshire', 'Staffordshire', 'Suffolk', 'Surrey', 'Warwickshire', 'West Midlands',
  'West Sussex', 'West Yorkshire', 'Wiltshire', 'Worcestershire',
  'Aberdeenshire', 'Angus', 'Argyll and Bute', 'Ayrshire', 'Dumfries and Galloway', 'East Lothian',
  'Fife', 'Highland', 'Lanarkshire', 'Midlothian', 'Moray', 'Perthshire', 'Renfrewshire',
  'Scottish Borders', 'West Lothian',
  'Anglesey', 'Carmarthenshire', 'Ceredigion', 'Denbighshire', 'Flintshire', 'Gwynedd',
  'Monmouthshire', 'Pembrokeshire', 'Powys', 'Vale of Glamorgan',
  'County Antrim', 'County Armagh', 'County Down', 'County Fermanagh', 'County Londonderry', 'County Tyrone',
];

module.exports = { UK_TOWNS };
