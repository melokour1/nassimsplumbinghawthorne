/* Generates the service pages for Nassim's Plumbing.
   Plain static HTML out -- no framework, no runtime dependency. */
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/moham/OneDrive/Desktop/Nassimsplumbing';
const OUT  = path.join(ROOT, 'services');

const BIZ = {
  name: "Nassim&rsquo;s Plumbing",
  legal: "Nassim&rsquo;s Plumbing LLC",
  phone: "(310) 617-9503",
  tel: "+13106179503",
  addr1: "4249 W 138th St #B",
  addr2: "Hawthorne, CA 90250",
  lic: "1155035",
  maps: "https://maps.google.com/?q=4249+W+138th+St+%23B,+Hawthorne,+CA+90250"
};

/* ---------------------------------------------------------------- icons */
/* 48x48 line-art glyphs. Reused at card size and blown up on the hero plate. */
const I = {
  emergency:  `<circle cx="24" cy="26" r="13"/><path d="M24 18v8l6 3"/><path d="M17 8l3 3M31 8l-3 3M24 6v3"/>`,
  drain:      `<circle cx="24" cy="24" r="13"/><path d="M14 20h20M14 28h20M20 12v24M28 12v24"/>`,
  jetting:    `<path d="M8 24h13"/><path d="M21 19h7v10h-7z"/><path d="M30 24h4M33 18l5-3M33 30l5 3M31 21l6-4M31 27l6 4"/>`,
  sewer:      `<path d="M6 32h12a6 6 0 0 1 6 6"/><path d="M24 38h6a6 6 0 0 0 6-6h6"/><path d="M6 14h36"/><rect x="19" y="8" width="10" height="7" rx="2"/>`,
  leak:       `<path d="M24 10s-8 9-8 14a8 8 0 0 0 16 0c0-5-8-14-8-14Z"/><path d="M9 34a21 21 0 0 0 30 0M4 40a29 29 0 0 0 40 0"/>`,
  slab:       `<path d="M6 16h36M6 24h36"/><path d="M24 28s-5 6-5 9a5 5 0 0 0 10 0c0-3-5-9-5-9Z"/><path d="M14 16v8M34 16v8"/>`,
  repipe:     `<path d="M6 34h10V18h14v16h12"/><circle cx="16" cy="34" r="3"/><circle cx="30" cy="18" r="3"/><path d="M12 14h8M28 34h8"/>`,
  heater:     `<rect x="14" y="7" width="20" height="34" rx="6"/><path d="M20 15h8M20 21h8"/><path d="M24 28v7"/><path d="M18 41v3M30 41v3"/>`,
  tankless:   `<rect x="11" y="10" width="26" height="20" rx="4"/><path d="M24 34v6"/><path d="M24 15s-4 4-4 7a4 4 0 0 0 8 0c0-3-4-7-4-7Z"/><path d="M17 40h14"/>`,
  boiler:     `<rect x="10" y="10" width="28" height="28" rx="5"/><circle cx="19" cy="21" r="5"/><path d="M19 18v3l2 1"/><path d="M28 18h6M28 24h6M28 30h6"/>`,
  gas:        `<path d="M8 30h10V20h12v10h10"/><path d="M24 8s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8Z"/><circle cx="18" cy="30" r="2.5"/><circle cx="30" cy="20" r="2.5"/>`,
  backflow:   `<path d="M4 24h6M38 24h6"/><rect x="10" y="17" width="28" height="14" rx="3"/><circle cx="19" cy="24" r="3.5"/><circle cx="29" cy="24" r="3.5"/><path d="M24 17v-5"/>`,
  toilet:     `<path d="M13 10h6v10"/><path d="M11 20h26a13 13 0 0 1-13 13h-1a12 12 0 0 1-12-12Z"/><path d="M18 33l-2 7h16l-2-7"/>`,
  shower:     `<path d="M14 6v10"/><path d="M8 18a6 6 0 0 1 12 0Z"/><path d="M11 24v4M14 27v4M17 24v4M11 33v4M17 33v4"/><path d="M26 40h14V26a7 7 0 0 0-14 0"/>`,
  disposal:   `<path d="M8 12h32"/><path d="M18 12v6h12v-6"/><rect x="17" y="18" width="14" height="16" rx="4"/><path d="M20 34v5h8v-5"/><path d="M20 24h8"/>`,
  remodel:    `<path d="M8 26h32v10a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4Z"/><path d="M24 26v-9a6 6 0 0 1 6-6h4"/><path d="M31 8h6v5h-6z"/><path d="M8 32h32"/>`,
  filter:     `<path d="M16 8h16v7l-4 4v16a4 4 0 0 1-8 0V19l-4-4Z"/><path d="M17 24h14"/><path d="M39 14s-3 4-3 6a3 3 0 0 0 6 0c0-2-3-6-3-6Z"/>`,
  softener:   `<rect x="13" y="10" width="22" height="30" rx="7"/><path d="M13 26h22"/><path d="M20 33l2-3 2 3-2 3zM27 34l1.6-2.4L30 34l-1.4 2z"/><path d="M24 10V6"/>`,
  commercial: `<path d="M8 40V12l12-5v33"/><path d="M20 40V18l18-5v27"/><path d="M12 16v3M12 23v3M12 30v3M26 24v3M32 24v3M26 32v3M32 32v3"/>`,
  agreement:  `<rect x="11" y="7" width="26" height="34" rx="4"/><path d="M18 7h12v5H18z"/><path d="M17 22l4 4 9-9"/><path d="M17 32h14"/>`
};

/* ---------------------------------------------------------------- data */
const SERVICES = [
  {
    slug: 'emergency-plumbing', name: 'Emergency Plumbing', short: '24/7 response',
    icon: I.emergency, tag: 'Burst line / no water',
    lede: 'Burst supply line, backed-up main, water where water should not be. Call and we will get the shut-off closed first, then give you a real plan.',
    intro: [
      'Most plumbing emergencies are a race against water damage, not against the plumbing itself. The first thing that matters is stopping the flow &mdash; and if you are not sure where your shut-off is, we will walk you to it on the phone before we are even out the door.',
      'From there it is diagnosis, then a written number, then the fix. We do not do the thing where the price goes up because it is late.'
    ],
    includes: ['Same-day and after-hours response', 'Phone guidance to your shut-off before we arrive', 'Burst and frozen supply lines', 'Backed-up mains and overflowing toilets', 'Ruptured water heater tanks', 'Temporary make-safe so you can use the house tonight'],
    signs: ['Water running where you cannot see the source', 'No water at any fixture in the house', 'Sewage backing up into a tub or shower', 'A water heater weeping from the tank body', 'A meter that keeps spinning with everything shut off'],
    rel: ['water-leak-detection', 'sewer-line-repair', 'water-heaters', 'repiping']
  },
  {
    slug: 'drain-cleaning', name: 'Drain Cleaning', short: 'Cabled and cleared',
    icon: I.drain, tag: 'Slow / clogged drains',
    lede: 'Kitchen, bath, laundry or main line. We clear it, then tell you honestly whether it was a one-off or the start of a pattern.',
    intro: [
      'A single slow drain is usually local &mdash; grease, hair, soap, something dropped. Several slow drains at once is almost never local, and cabling one fixture just moves the problem downstream for a few weeks.',
      'So we start by working out which one you have. That answer changes the whole job, and it costs you nothing to know it before you commit.'
    ],
    includes: ['Kitchen, lavatory, tub, shower and laundry lines', 'Main line cabling through the cleanout', 'Proper drum machine and sectional cabling', 'Camera follow-up when the line resists', 'Fixture reset and a run test before we leave', 'Drop cloths and clean-up as standard'],
    signs: ['Water standing in the sink long after you finish', 'Gurgling from a nearby drain when another one runs', 'A smell coming up out of the drain', 'More than one fixture slowing down in the same week', 'A clog that comes back within a month of clearing'],
    rel: ['hydro-jetting', 'sewer-line-repair', 'toilet-repair', 'garbage-disposal']
  },
  {
    slug: 'hydro-jetting', name: 'Hydro Jetting', short: 'Scours the pipe wall',
    icon: I.jetting, tag: 'High-pressure cleaning',
    lede: 'A cable punches a hole through the blockage. A jetter scrubs the pipe back to its actual diameter. For grease and root film, that difference is everything.',
    intro: [
      'Hydro jetting runs high-pressure water through a nozzle that pulls itself up the line, cutting grease, scale and root hair off the pipe wall on the way. It is the right tool when the line keeps closing up no matter how often it gets cabled.',
      'It is not the right tool for every pipe. Old, thin or already-cracked cast iron can be made worse by it, which is why we camera the line first and tell you if jetting is a bad idea here.'
    ],
    includes: ['Camera inspection before and after', 'Grease, soap scale and root film removal', 'Kitchen lines, mains and commercial waste lines', 'Nozzle selection matched to the pipe', 'Pressure matched to pipe age and material', 'A straight answer if your pipe is not a candidate'],
    signs: ['A line that needs cabling two or three times a year', 'A restaurant or shared kitchen line slowing down', 'Root intrusion found on a previous camera run', 'Slow drainage that returns within weeks', 'Standing water in a floor drain or grease interceptor'],
    rel: ['drain-cleaning', 'sewer-line-repair', 'commercial-plumbing', 'service-agreements']
  },
  {
    slug: 'sewer-line-repair', name: 'Sewer Line Repair &amp; Replacement', short: 'Mains and laterals',
    icon: I.sewer, tag: 'Main line / lateral',
    lede: 'When the trouble is past the cleanout, guessing gets expensive fast. We put a camera down the line and show you the footage before anybody digs.',
    intro: [
      'A sewer lateral fails in a small number of ways: roots find a joint, the pipe bellies and holds water, or old clay and cast iron simply crack. Each of those has a different fix and a very different price, and you cannot tell them apart from the top of the cleanout.',
      'So the camera goes first, always. You see what we see, we locate the defect on the surface, and then you decide between a spot repair and a full replacement with the actual facts in front of you.'
    ],
    includes: ['Video camera inspection with locating', 'Spot repairs where the defect is isolated', 'Full lateral replacement where it is not', 'Cleanout installation if the line has no access', 'Permit handling and inspection scheduling', 'Backfill, compaction and surface restoration'],
    signs: ['Several fixtures backing up at the same time', 'Wastewater rising in the shower when a toilet flushes', 'A patch of lawn that is greener or sunken than the rest', 'Repeat main-line clogs a few months apart', 'Sewer smell outside near the line run'],
    rel: ['hydro-jetting', 'drain-cleaning', 'repiping', 'emergency-plumbing']
  },
  {
    slug: 'water-leak-detection', name: 'Water Leak Detection', short: 'Find it before you open it',
    icon: I.leak, tag: 'Non-invasive locating',
    lede: 'The stain on the ceiling is rarely above the leak. We locate the source properly so the repair is one small opening instead of four exploratory ones.',
    intro: [
      'Water travels along joists, inside walls and under slab before it shows itself, which is why the visible damage is such a poor guide to the actual break. Opening drywall to go looking is the expensive way to find out.',
      'We isolate the system, watch the meter, and use acoustic and pressure methods to narrow it to a spot. Then we open one place.'
    ],
    includes: ['Meter isolation testing to confirm an active leak', 'Acoustic listening on pressurised lines', 'Pressure testing by zone', 'Slab, wall and under-cabinet locating', 'Written findings you can hand to an insurer', 'Repair quoted separately so you are free to choose'],
    signs: ['A water bill that jumped with no change in use', 'The meter dial moving with every fixture off', 'A warm patch on the floor, or damp carpet edges', 'Musty smell in a closet or along a baseboard', 'Paint bubbling or a ceiling stain that keeps growing'],
    rel: ['slab-leak-repair', 'repiping', 'emergency-plumbing', 'backflow-prevention']
  },
  {
    slug: 'slab-leak-repair', name: 'Slab Leak Repair', short: 'Under the foundation',
    icon: I.slab, tag: 'Under-slab supply line',
    lede: 'A pressurised line failing under a concrete slab. Located precisely, then repaired, re-routed or repiped &mdash; whichever actually makes sense for your house.',
    intro: [
      'Slab leaks are common in this part of the South Bay because of the age of the copper and the soil it sits in. Once one pinhole goes, the rest of that run is usually not far behind.',
      'That is the real decision on a slab leak: patch this one spot, or re-route the line overhead and stop doing this every eighteen months. We will tell you which one we would do if it were our house, and price both.'
    ],
    includes: ['Precise electronic and acoustic locating', 'Spot repair through the slab where appropriate', 'Overhead or perimeter re-route as an alternative', 'Full repipe quoted when the run is failing generally', 'Concrete cut, patch and finish', 'Pressure test and verification before we close up'],
    signs: ['A warm spot on the floor with no obvious cause', 'The sound of running water when nothing is on', 'Cracks appearing in flooring or at the slab edge', 'Hot water pressure dropping off over months', 'A high bill together with damp along one wall'],
    rel: ['water-leak-detection', 'repiping', 'emergency-plumbing', 'water-heaters']
  },
  {
    slug: 'repiping', name: 'Repiping', short: 'Copper and PEX',
    icon: I.repipe, tag: 'Whole-house supply',
    lede: 'When the old galvanized has run out of road. Planned in sequence so you are never without water overnight.',
    intro: [
      'Galvanized steel closes up from the inside. By the time the pressure at the shower is noticeably down, the interior diameter can be a fraction of what it started as, and no amount of fixture work will bring it back.',
      'A repipe replaces the supply system rather than chasing it. We stage the work so the house stays livable, pull the permits, and get it inspected properly.'
    ],
    includes: ['Whole-house copper or PEX supply replacement', 'Partial repipes where only one run has failed', 'Manifold or trunk-and-branch layouts', 'Permit handling and city inspection', 'Drywall access cut cleanly and patched', 'Pressure test and full fixture check at the end'],
    signs: ['Pressure that drops when a second tap opens', 'Rusty or discoloured water on the first draw', 'Repeated pinhole leaks on the same run', 'Visible corrosion or scaling at exposed joints', 'A house on original galvanized piping'],
    rel: ['slab-leak-repair', 'water-leak-detection', 'bathroom-kitchen-remodeling', 'water-heaters']
  },
  {
    slug: 'water-heaters', name: 'Water Heaters', short: 'Repair and replace',
    icon: I.heater, tag: 'Tank storage units',
    lede: 'Repaired, flushed or replaced &mdash; with the venting, seismic strapping and expansion control done the way code actually requires.',
    intro: [
      'Most tank heaters give warning before they fail outright: longer recovery, rumbling from sediment, rusty hot water, a weeping fitting. Caught early, a lot of that is serviceable.',
      'Once the tank body itself is leaking, it is replacement &mdash; and that is the point where the install details matter. California requires proper seismic strapping, and a closed system needs expansion control or the new tank will be under stress from day one.'
    ],
    includes: ['Thermostat, element and gas control diagnosis', 'Anode rod and sediment flush service', 'T&amp;P valve and expansion tank work', 'Full tank replacement, gas or electric', 'Seismic strapping to California requirements', 'Correct venting, drip pan and drain routing'],
    signs: ['Hot water running out much faster than it used to', 'Rumbling or popping from the tank when it heats', 'Rusty water from the hot side only', 'Damp or rust at the base of the tank', 'A unit past ten or twelve years of service'],
    rel: ['tankless-water-heaters', 'boiler-repair', 'gas-line-repair', 'emergency-plumbing']
  },
  {
    slug: 'tankless-water-heaters', name: 'Tankless Water Heaters', short: 'On-demand hot water',
    icon: I.tankless, tag: 'On-demand units',
    lede: 'Endless hot water and a smaller footprint &mdash; when the gas line and venting can actually support it. We check that first, not after.',
    intro: [
      'Tankless units are excellent in the right house. They are also frequently sold into houses where the existing gas line is undersized for the burner, which produces a unit that never quite performs and a customer who blames the technology.',
      'So before we quote a swap, we size the gas supply, look at the vent run, and check what the incoming water hardness is going to do to the heat exchanger. If the answer is that a tank is the better buy here, we will say so.'
    ],
    includes: ['Gas line sizing and upgrade where needed', 'Stainless or concentric venting run correctly', 'Tank-to-tankless conversions', 'Descaling and annual maintenance service', 'Condensate handling on condensing units', 'Recirculation options where the run is long'],
    signs: ['Running out of hot water with back-to-back showers', 'Wanting the closet or garage space back', 'An old tank due for replacement anyway', 'A long wait for hot water at the far fixture', 'Scale build-up shortening the life of past units'],
    rel: ['water-heaters', 'gas-line-repair', 'water-softeners', 'boiler-repair']
  },
  {
    slug: 'boiler-repair', name: 'Boiler Repair &amp; Install', short: 'Hydronic systems',
    icon: I.boiler, tag: 'Hydronic heat',
    lede: 'Hydronic heating and domestic hot water &mdash; circulators, zone valves, expansion and controls, diagnosed properly rather than swapped hopefully.',
    intro: [
      'Boiler faults are usually a system problem wearing a boiler costume. A cold zone is more often a seized circulator, a stuck zone valve or an air-bound loop than it is the appliance itself.',
      'We work the system through in order &mdash; pressure, air, flow, then controls &mdash; so you are not paying for parts that were never the fault.'
    ],
    includes: ['No-heat and intermittent-fault diagnosis', 'Circulator, zone valve and control repair', 'Expansion tank and pressure-relief work', 'System purging and air elimination', 'Boiler replacement and commissioning', 'Combustion and venting checks'],
    signs: ['One zone staying cold while the others heat', 'Pressure gauge reading high or dropping steadily', 'Banging or knocking in the pipework', 'The boiler short-cycling on and off', 'Relief valve discharging water'],
    rel: ['water-heaters', 'gas-line-repair', 'commercial-plumbing', 'service-agreements']
  },
  {
    slug: 'gas-line-repair', name: 'Gas Line Repair', short: 'Leaks, runs and stub-outs',
    icon: I.gas, tag: 'Fuel gas piping',
    lede: 'Leak testing, repair and new runs for ranges, dryers, heaters, fire pits and generators &mdash; pressure tested and inspected.',
    intro: [
      'Gas work is not the place for approximation. Every run gets sized for the load it has to carry and the distance it has to carry it, and every joint gets pressure tested before it goes into service.',
      'If you smell gas right now, leave the building and call the gas utility from outside first. Then call us.'
    ],
    includes: ['Leak location and repair on existing runs', 'New appliance runs and stub-outs', 'Line sizing for total connected load', 'Sediment traps and shut-off valves at appliances', 'Pressure testing and permit inspection', 'Corrugated stainless and black iron work'],
    signs: ['A gas smell near an appliance or meter', 'A pilot that will not stay lit', 'Adding a range, dryer, heater or outdoor appliance', 'A new tankless unit that needs more gas than the line carries', 'Visible corrosion on exposed gas piping'],
    rel: ['tankless-water-heaters', 'water-heaters', 'boiler-repair', 'emergency-plumbing']
  },
  {
    slug: 'backflow-prevention', name: 'Backflow Prevention', short: 'Testing and certification',
    icon: I.backflow, tag: 'Cross-connection control',
    lede: 'Assembly testing, repair and replacement so the potable supply stays potable &mdash; and so your annual notice gets answered on time.',
    intro: [
      'A backflow assembly is the one device standing between an irrigation, boiler or process line and the drinking water in the building. Water districts require them tested annually, and they do follow up.',
      'We test, we submit, and if the assembly fails we rebuild or replace it and retest rather than leaving you to chase a second contractor.'
    ],
    includes: ['Annual certification testing', 'Report filing with the water purveyor', 'Assembly rebuild with manufacturer kits', 'Replacement of failed or frozen assemblies', 'New installations on irrigation and fire lines', 'Freeze protection and enclosure work'],
    signs: ['An annual test notice from your water district', 'An assembly that has never been tested', 'Discoloured water after irrigation runs', 'A new irrigation system or added water feature', 'A commercial tenant improvement requiring sign-off'],
    rel: ['commercial-plumbing', 'water-filtration', 'service-agreements', 'water-leak-detection']
  },
  {
    slug: 'toilet-repair', name: 'Toilet Repair &amp; Installation', short: 'Running, rocking, leaking',
    icon: I.toilet, tag: 'Fixture service',
    lede: 'Running fills, weak flushes, rocking bowls and wax seal leaks &mdash; plus clean replacement when the fixture is not worth saving.',
    intro: [
      'A running toilet is the quietest expensive thing in a house. A flapper that seats badly can pass a lot of water a day without ever making a noise you would notice on the bill until it arrives.',
      'Rocking is the one to take seriously. Movement breaks the wax seal, and once that is broken the leak goes into the subfloor rather than onto it, so you may not see it for a long time.'
    ],
    includes: ['Fill valve, flapper and flush valve rebuild', 'Wax or waxless seal replacement', 'Closet flange repair and re-set', 'Supply line and angle stop replacement', 'New toilet supply and installation', 'Haul-away of the old fixture'],
    signs: ['Water refilling the tank on its own', 'A bowl that rocks when you sit down', 'A weak or incomplete flush', 'Damp or dark flooring around the base', 'Repeated clogs on one toilet only'],
    rel: ['drain-cleaning', 'bathroom-kitchen-remodeling', 'shower-installation', 'water-leak-detection']
  },
  {
    slug: 'shower-installation', name: 'Shower Installation', short: 'Valves and full rough-in',
    icon: I.shower, tag: 'Valve and trim',
    lede: 'Valve swaps, full rough-ins and pan work &mdash; done to code, pressure tested, and coordinated around the rest of your build.',
    intro: [
      'Most shower complaints trace back to the valve rather than the head. Temperature that swings when a toilet flushes usually means a valve without pressure balance, and no amount of trim will fix that.',
      'On a full rough-in, the order matters &mdash; drain and pan, then valve, then test, then close up. We do not close a wall we have not pressure tested.'
    ],
    includes: ['Pressure-balance and thermostatic valve installation', 'Full rough-in for new and remodelled showers', 'Shower pan drains and liner coordination', 'Body sprays, rain heads and hand-held additions', 'Trim installation and adjustment', 'Pressure testing before anything closes up'],
    signs: ['Water going cold when another fixture runs', 'A valve that drips no matter how hard you close it', 'Weak flow at the head only', 'Planning a bathroom remodel or tub-to-shower conversion', 'A pan or base showing signs of leaking below'],
    rel: ['bathroom-kitchen-remodeling', 'toilet-repair', 'repiping', 'water-leak-detection']
  },
  {
    slug: 'garbage-disposal', name: 'Garbage Disposal Installation', short: 'Jams, leaks, replacements',
    icon: I.disposal, tag: 'Sink waste unit',
    lede: 'Jammed, humming, leaking or simply done. Replaced properly with the drain arrangement corrected rather than reused as-is.',
    intro: [
      'A disposal that hums without turning is jammed, not dead, and that is usually a five minute job. A disposal that leaks from the body is finished &mdash; the housing has corroded through and there is nothing to seal.',
      'When we replace one we redo the drain arm and trap arrangement at the same time. Reusing a marginal setup is how you end up back under the sink in six months.'
    ],
    includes: ['Jam clearing and reset', 'Motor and switch diagnosis', 'Full unit replacement, any common brand', 'Drain arm, trap and dishwasher tie-in redone', 'Sink flange re-seal', 'Old unit removed and taken away'],
    signs: ['Humming with no rotation', 'Water pooling in the cabinet below', 'A grinding noise that will not clear', 'Persistent smell that survives cleaning', 'Slow draining on the disposal side only'],
    rel: ['drain-cleaning', 'bathroom-kitchen-remodeling', 'toilet-repair', 'water-leak-detection']
  },
  {
    slug: 'bathroom-kitchen-remodeling', name: 'Bathroom &amp; Kitchen Remodeling', short: 'Rough-in to trim',
    icon: I.remodel, tag: 'Remodel plumbing',
    lede: 'The plumbing half of your remodel &mdash; rough-in, inspection and trim, sequenced so we are never the trade holding everyone else up.',
    intro: [
      'On a remodel, plumbing is mostly a scheduling problem. The rough-in has to be in and inspected before anyone closes a wall, and the trim cannot go on until the finishes are done. Get that order wrong and it costs weeks.',
      'We work to your contractor&rsquo;s schedule, pull our own permits, and are on site when we said we would be.'
    ],
    includes: ['Supply and drain relocation for new layouts', 'Full rough-in with permit and inspection', 'Tub, shower, vanity and sink installation', 'Pot fillers, filtered taps and appliance connections', 'Trim-out and final adjustment', 'Coordination with your GC, tile and cabinet trades'],
    signs: ['Moving a sink, tub or toilet from where it is now', 'Converting a tub to a walk-in shower', 'Adding a second bathroom or a wet bar', 'Old supply lines exposed during demolition', 'A remodel that needs permitted plumbing sign-off'],
    rel: ['shower-installation', 'toilet-repair', 'repiping', 'garbage-disposal']
  },
  {
    slug: 'water-filtration', name: 'Water Filtration', short: 'Point-of-use and whole-house',
    icon: I.filter, tag: 'Treatment systems',
    lede: 'Under-sink and whole-house treatment, specified from what is actually in your water rather than from a catalogue.',
    intro: [
      'Filtration only works if it is matched to the problem. Chlorine taste, sediment, hardness and specific contaminants each need a different media, and a system chosen for the wrong one is an expensive way to change nothing.',
      'We start from your water &mdash; the district report plus a test at the tap &mdash; and then specify to that.'
    ],
    includes: ['Water testing at the tap', 'Under-sink drinking water systems', 'Whole-house sediment and carbon filtration', 'Reverse osmosis installation and service', 'Dedicated filtered faucet installation', 'Cartridge change schedules and service visits'],
    signs: ['Chlorine or metallic taste at the tap', 'Sediment or cloudiness in drawn water', 'Buying bottled water for drinking and cooking', 'Staining in sinks, tubs or laundry', 'A new appliance the manufacturer wants filtered water for'],
    rel: ['water-softeners', 'backflow-prevention', 'service-agreements', 'repiping']
  },
  {
    slug: 'water-softeners', name: 'Water Softeners', short: 'Hardness and scale',
    icon: I.softener, tag: 'Ion exchange',
    lede: 'Hard water quietly shortens the life of every heater, valve and cartridge in the house. Softening is maintenance you do once.',
    intro: [
      'Hardness shows up as scale inside the water heater, on shower glass, and in the seats of every mixing valve you own. It is not a health problem &mdash; it is a cost problem, spread thinly across everything water touches.',
      'We size a softener to the household&rsquo;s actual peak demand and grain load so it regenerates on the right cycle, rather than eating salt to no purpose.'
    ],
    includes: ['Hardness testing and grain-capacity sizing', 'Softener installation with bypass', 'Brine tank setup and regeneration programming', 'Salt-free conditioner options where preferred', 'Existing system service and repair', 'Drain and discharge routed to code'],
    signs: ['Scale on faucets, shower glass and kettles', 'Soap that will not lather properly', 'Laundry coming out stiff or dull', 'Water heaters failing earlier than they should', 'A new tankless unit you want to protect'],
    rel: ['water-filtration', 'tankless-water-heaters', 'water-heaters', 'service-agreements']
  },
  {
    slug: 'commercial-plumbing', name: 'Commercial Plumbing', short: 'Tenants and facilities',
    icon: I.commercial, tag: 'Commercial &amp; multi-unit',
    lede: 'Restaurants, retail, offices and multi-unit residential &mdash; scheduled around your trading hours instead of across them.',
    intro: [
      'Commercial work is judged on downtime more than anything else. A restaurant with a closed kitchen line is losing money by the hour, and a building with a failed riser has a lot of unhappy tenants at once.',
      'We schedule around the hours that matter to you, keep property managers informed as the job moves, and document what was done for your records.'
    ],
    includes: ['Restaurant kitchen and grease waste lines', 'Multi-unit riser and branch work', 'Tenant improvement rough-in and trim', 'Backflow assembly testing and certification', 'Scheduled preventive maintenance', 'After-hours and overnight scheduling'],
    signs: ['Kitchen drains slowing during service', 'Recurring complaints from the same units', 'A tenant improvement needing permitted plumbing', 'Backflow certification coming due', 'A building with no maintenance history on its lines'],
    rel: ['hydro-jetting', 'backflow-prevention', 'service-agreements', 'boiler-repair']
  },
  {
    slug: 'service-agreements', name: 'Service Agreements', short: 'Planned maintenance',
    icon: I.agreement, tag: 'Maintenance plan',
    lede: 'Scheduled maintenance for homes and buildings, so the things that fail predictably get caught on a Tuesday instead of a holiday weekend.',
    intro: [
      'Almost nothing in a plumbing system fails without warning. Heaters silt up, angle stops seize, supply lines age, backflow assemblies come due. All of it is visible in advance if somebody looks.',
      'An agreement is just that looking, on a schedule, with a written record of what was checked and what is coming.'
    ],
    includes: ['Scheduled annual or semi-annual visits', 'Water heater flush and anode inspection', 'Shut-off and angle stop exercise and check', 'Backflow testing scheduled before it lapses', 'Drain line inspection on problem runs', 'Written condition report after every visit'],
    signs: ['A building with no maintenance history', 'Repeated call-outs for the same problem', 'Compliance testing you keep having to chase', 'Property you manage rather than live in', 'Wanting the budget predictable across the year'],
    rel: ['commercial-plumbing', 'backflow-prevention', 'water-heaters', 'drain-cleaning']
  }
];

/* One-line card summaries. The lede is written to be read on the service page
   itself, so its first sentence rarely stands alone in a grid. */
const CARDS = {
  'emergency-plumbing': 'Same-day and after-hours response when water is going where it should not.',
  'drain-cleaning': 'Kitchen, bath, laundry and main lines cleared properly, not just poked through.',
  'hydro-jetting': 'High-pressure cleaning that scrubs grease and root film off the pipe wall.',
  'sewer-line-repair': 'Camera down the line first, then a spot repair or a full lateral replacement.',
  'water-leak-detection': 'Finding the actual source before any drywall or concrete gets opened.',
  'slab-leak-repair': 'Under-slab supply leaks located precisely, then repaired or re-routed.',
  'repiping': 'Whole-house copper or PEX when the old galvanized has run out of road.',
  'water-heaters': 'Tanks repaired, flushed or replaced &mdash; strapped and vented to code.',
  'tankless-water-heaters': 'On-demand hot water, with the gas line sized to actually run it.',
  'boiler-repair': 'Hydronic heat diagnosed as a system rather than swapped part by part.',
  'gas-line-repair': 'Leak testing, repairs and new appliance runs, pressure tested and inspected.',
  'backflow-prevention': 'Annual assembly testing, rebuilds and replacement, filed on time.',
  'toilet-repair': 'Running fills, rocking bowls, wax seals and clean replacements.',
  'shower-installation': 'Valve swaps and full rough-ins, pressure tested before anything closes.',
  'garbage-disposal': 'Jams cleared, units replaced and the drain arrangement corrected.',
  'bathroom-kitchen-remodeling': 'The plumbing half of your remodel, rough-in through trim.',
  'water-filtration': 'Point-of-use and whole-house treatment matched to your actual water.',
  'water-softeners': 'Hardness dealt with before it eats another water heater.',
  'commercial-plumbing': 'Restaurants, retail and multi-unit, scheduled around your trading hours.',
  'service-agreements': 'Planned maintenance, so failures land on a Tuesday and not a holiday.'
};
SERVICES.forEach(s => { s.card = CARDS[s.slug] || s.short; });

const BY_SLUG = Object.fromEntries(SERVICES.map(s => [s.slug, s]));

/* ---------------------------------------------------------------- chrome */

const PHONE_SVG = `<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>`;
const SMS_SVG   = `<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1-5a8 8 0 1 1 17-6Z"/></svg>`;
const CAL_SVG   = `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;

/* ##### SECTION: CHROME / UTILITY TOP BAR ##### */
function topbar(){
  return `<div class="topbar">
  <a href="tel:${BIZ.tel}">${PHONE_SVG} Emergency service: ${BIZ.phone}</a>
  <div class="tb-right">
    <span class="tb-note">Serving the South Bay &middot; CA Lic. ${BIZ.lic}</span>
    <a href="sms:${BIZ.tel}">${SMS_SVG} Text us</a>
  </div>
</div>`;
}

function nav(depth){
  const up = depth ? '../' : '';
  return `<header class="nav" id="nav">
  <a class="brand" href="${up}index.html" aria-label="${BIZ.name} home">
    <span class="brand-chip"><img src="${up}assets/mark.png" alt="${BIZ.name}"></span>
    <span class="brand-name">
      <b>${BIZ.name}</b>
      <span>South Bay, CA</span>
    </span>
  </a>
  <nav class="nav-links" id="navLinks">
    <a href="${up}services/index.html">Services</a>
    <a href="${up}index.html#process">Process</a>
    <a href="${up}index.html#area">Service Area</a>
    <a href="${up}index.html#contact">Contact</a>
  </nav>
  <div class="nav-actions">
    <a class="nav-call" href="tel:${BIZ.tel}">
      ${PHONE_SVG}
      <span>${BIZ.phone}</span>
    </a>
    <button class="nav-book" type="button" data-book>Book online</button>
    <button class="nav-burger" id="burger" aria-label="Menu" aria-expanded="false"><i></i><i></i><i></i></button>
  </div>
</header>`;
}

/* ##### SECTION: CHROME / MOBILE STICKY ACTION BAR ##### */
function stickyBar(){
  return `<nav class="sticky-bar" aria-label="Quick actions">
  <a class="primary" href="tel:${BIZ.tel}">${PHONE_SVG}<span>Call</span></a>
  <a href="sms:${BIZ.tel}">${SMS_SVG}<span>Text</span></a>
  <button type="button" data-book>${CAL_SVG}<span>Book</span></button>
</nav>`;
}

/* ##### SECTION: CHROME / SCRIPTS ##### */
function scripts(depth){
  const up = depth ? '../' : '';
  return `<script>
/* Point these at your own endpoints to switch the assistant from its
   built-in offline mode to Claude, and the booking form from SMS to a
   server post. Leave them out and both still work with no backend. */
window.NP = {
  phone: '${BIZ.phone}',
  tel: '${BIZ.tel}',
  markSrc: '${up}assets/mark.png'
  // chatEndpoint: '/api/chat',
  // bookEndpoint: '/api/book'
};
</script>
<script src="${up}assets/site.js"></script>
<script src="${up}assets/booking.js"></script>
<script src="${up}assets/chat.js"></script>`;
}

function footer(depth){
  const up = depth ? '../' : '';
  const svcLinks = SERVICES.map(s =>
    `<li><a href="${up}services/${s.slug}.html">${s.name}</a></li>`).join('\n          ');

  return `<!-- ##### SECTION: MARKUP / FOOTER ##### -->
<footer class="foot-tg" id="contact">
  <div class="wrap">
    <div class="foot-cols">

      <div data-rev>
        <h4>About us</h4>
        <div class="foot-brand-card"><img src="${up}assets/logo.png" alt="${BIZ.legal}"></div>
        <p>${BIZ.legal} is a licensed plumbing contractor serving homes and businesses across the South Bay. Quality work, honest service &mdash; and a flat number before the wrench comes out.</p>
        <p>Residential and light commercial, from a single angle stop to a full repipe. Licensed with the California State License Board and insured.</p>
        <div class="foot-badges">
          <span>CA Lic. ${BIZ.lic}</span><span>Licensed</span><span>Insured</span>
        </div>
        <div class="foot-mini">
          <a href="${up}services/index.html">All services</a>
          <a href="${up}index.html#area">Service area</a>
          <a href="${up}index.html#process">Our process</a>
        </div>
      </div>

      <div data-rev>
        <h4>Services</h4>
        <ul class="foot-service-links">
          ${svcLinks}
        </ul>
      </div>

      <div data-rev>
        <h4>Contact us</h4>
        <address>
          ${BIZ.legal}<br>
          <a href="${BIZ.maps}" target="_blank" rel="noopener">${BIZ.addr1}<br>${BIZ.addr2}</a><br>
          Phone: <a href="tel:${BIZ.tel}">${BIZ.phone}</a><br>
          Text: <a href="sms:${BIZ.tel}">${BIZ.phone}</a>
        </address>
        <h4>Hours</h4>
        <ul>
          <li>Scheduled work &mdash; by appointment</li>
          <li>Emergency line &mdash; call anytime</li>
        </ul>
        <div class="foot-social">
          <a href="tel:${BIZ.tel}" aria-label="Call us"><svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg></a>
          <a href="sms:${BIZ.tel}" aria-label="Text us"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3 1-5a8 8 0 1 1 17-6Z"/></svg></a>
          <a href="${BIZ.maps}" target="_blank" rel="noopener" aria-label="Find us on the map"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg></a>
        </div>
      </div>

      <div data-rev>
        <h4>Service area</h4>
        <div class="foot-map">
          <canvas data-map></canvas>
          <div class="map-pin"><i></i><b>South Bay</b></div>
        </div>
        <h4>Licensing</h4>
        <div class="foot-kv">
          <b>CSLB Lic.</b><span>${BIZ.lic}</span>
          <b>Status</b><span>Licensed &amp; insured</span>
          <b>Region</b><span>South Bay, Los Angeles County</span>
        </div>
      </div>

    </div>

    <div class="foot-bottom">
      <span>&copy; <span data-year>2026</span> ${BIZ.legal}. All rights reserved.</span>
      <span class="lic"><i></i> CA Lic. No ${BIZ.lic} &middot; Quality Work. Honest Service.</span>
    </div>
  </div>
</footer>`;
}

/* The hero "picture": one clean SVG plate, service glyph blown up inside it. */
function plate(svc){
  return `<div class="plate" data-rev>
          <svg viewBox="0 0 400 300" role="img" aria-label="${svc.name.replace(/&amp;/g,'and')} illustration">
            <defs>
              <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#7a58e8" stop-opacity=".55"/>
                <stop offset="1" stop-color="#3fe0d0" stop-opacity=".55"/>
              </linearGradient>
              <radialGradient id="pgl" cx="50%" cy="42%" r="52%">
                <stop offset="0" stop-color="#3fe0d0" stop-opacity=".30"/>
                <stop offset="1" stop-color="#3fe0d0" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="pdrop" cx="38%" cy="34%" r="66%">
                <stop offset="0" stop-color="#ffe3a8"/>
                <stop offset="1" stop-color="#ffb02e"/>
              </radialGradient>
            </defs>

            <!-- isometric ground grid -->
            <g stroke="#3fe0d0" stroke-opacity=".10" stroke-width="1">
              ${Array.from({length:13},(_,i)=>`<path d="M${-120+i*44} 300 L${120+i*44} 0"/>`).join('')}
              ${Array.from({length:13},(_,i)=>`<path d="M${520-i*44} 300 L${280-i*44} 0"/>`).join('')}
            </g>

            <ellipse cx="200" cy="150" rx="180" ry="140" fill="url(#pgl)"/>

            <!-- the service glyph, scaled up from the 48-unit icon grid -->
            <g transform="translate(200 150) scale(3.42) translate(-24 -24)"
               fill="none" stroke="url(#pg)" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round">
              ${svc.icon}
            </g>
            <g transform="translate(200 150) scale(3.42) translate(-24 -24)"
               fill="none" stroke="#dceeff" stroke-opacity=".85" stroke-width="1.05"
               stroke-linecap="round" stroke-linejoin="round">
              ${svc.icon}
            </g>

            <!-- droplet accent -->
            <circle cx="316" cy="72" r="9" fill="url(#pdrop)"/>
            <circle cx="316" cy="72" r="26" fill="#ffb02e" opacity=".13"/>
            <circle cx="316" cy="72" r="44" fill="#ffb02e" opacity=".06"/>
          </svg>
          <span class="plate-tag">${svc.tag}</span>
        </div>`;
}

/* ---------------------------------------------------------------- page */
function servicePage(svc){
  const plain = svc.name.replace(/&amp;/g, '&').replace(/&rsquo;/g, "'");
  const rel = svc.rel.map(sl => BY_SLUG[sl]).filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
<!-- ##### SECTION: HEAD / SEO ##### -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${plain} in the South Bay, CA | Nassim&rsquo;s Plumbing</title>
<meta name="description" content="${svc.lede.replace(/&mdash;/g,'-').replace(/&rsquo;/g,"'").replace(/"/g,'').slice(0,155)}">
<meta name="theme-color" content="#050d1c">
<link rel="icon" href="../assets/mark.png">
<link rel="apple-touch-icon" href="../assets/mark.png">
<meta property="og:title" content="${plain} | Nassim&rsquo;s Plumbing">
<meta property="og:description" content="${svc.short} - across the South Bay, Los Angeles County. CA Lic. No ${BIZ.lic}.">
<meta property="og:type" content="website">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/site.css">
<link rel="stylesheet" href="../assets/ui.css">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Service",
  "serviceType": "${plain}",
  "provider": {
    "@type": "Plumber",
    "name": "${BIZ.legal.replace(/&rsquo;/g,"'")}",
    "telephone": "+1-310-617-9503",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "${BIZ.addr1}",
      "addressLocality": "Hawthorne",
      "addressRegion": "CA",
      "postalCode": "90250",
      "addressCountry": "US"
    }
  },
  "areaServed": "South Bay, Los Angeles County, CA"
}
</script>
</head>
<body>

${topbar()}

${nav(1)}

<main>
<!-- ##### SECTION: MARKUP / SERVICE HERO ##### -->
<section class="svc-hero">
  <div class="wrap">
    <div class="svc-hero-grid">
      <div data-rev>
        <div class="crumbs">
          <a href="../index.html">Home</a><span>/</span>
          <a href="index.html">Services</a><span>/</span>
          ${plain}
        </div>
        <h1>${svc.name}</h1>
        <p class="lede">${svc.lede}</p>
        <div class="cta">
          <button class="btn btn-solid" type="button" data-book="${plain.replace(/"/g,'')}">Schedule service</button>
          <a class="btn btn-ghost" href="tel:${BIZ.tel}">Call ${BIZ.phone}</a>
        </div>
      </div>
      ${plate(svc)}
    </div>
  </div>
</section>

<!-- ##### SECTION: MARKUP / SERVICE CTA BAND ##### -->
<div class="svc-band">
  <div class="wrap">
    <h2>${plain} in the South Bay</h2>
    <div class="row">
      <button class="btn btn-solid" type="button" data-book="${plain.replace(/"/g,'')}">Book online</button>
      <a class="btn btn-ghost" href="tel:${BIZ.tel}">${BIZ.phone}</a>
      <button class="btn btn-ghost" type="button" data-chat>Ask a question</button>
    </div>
  </div>
</div>

<!-- ##### SECTION: MARKUP / DETAIL ##### -->
<div class="band">
<section class="sec" id="included">
  <div class="wrap">
    <div class="two-col">
      <div class="prose" data-rev>
        <div class="eyebrow">The work</div>
        <h2>How we approach it</h2>
        ${svc.intro.map(p => `<p>${p}</p>`).join('\n        ')}
      </div>
      <div data-rev>
        <h3 style="font-family:var(--serif);font-size:20px;color:var(--white);margin:0 0 20px">What the job covers</h3>
        <ul class="ticks">
          ${svc.includes.map(x => `<li>${x}</li>`).join('\n          ')}
        </ul>
      </div>
    </div>
  </div>
</section>
</div>

<!-- ##### SECTION: MARKUP / SIGNS + CALLOUT ##### -->
<div class="band band-navy">
<section class="sec">
  <div class="wrap">
    <div class="two-col">
      <div data-rev>
        <div class="eyebrow">Worth a call</div>
        <h2 style="font-size:clamp(26px,3.1vw,40px);margin-bottom:26px">Signs you are looking at this job</h2>
        <ul class="ticks">
          ${svc.signs.map(x => `<li>${x}</li>`).join('\n          ')}
        </ul>
      </div>
      <div class="callout" data-rev>
        <h3>Not sure which one it is?</h3>
        <p>Describe it however it comes out &mdash; the noise, the smell, where the water is. We ask the few questions that narrow it down and tell you whether it needs someone today or whether it can wait until the week.</p>
        <p style="margin-top:14px">No trip charge for a quote inside the service area, and a flat number before any work starts.</p>
        <button class="btn" type="button" data-book>
          <span class="dot"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
          Call ${BIZ.phone}
        </a>
      </div>
    </div>
  </div>
</section>
</div>

<!-- ##### SECTION: MARKUP / PROCESS ##### -->
<div class="band">
<section class="sec">
  <div class="wrap">
    <div class="eyebrow" data-rev>How the visit goes</div>
    <div class="steps" data-rev style="margin-top:34px">
      <div class="step"><b>01</b><h3>You call</h3><p>Tell us what it is doing. We ask what narrows it down and give you a window we can actually keep.</p></div>
      <div class="step"><b>02</b><h3>We diagnose</h3><p>On site, with the right instruments. You see what we see before anything gets opened up.</p></div>
      <div class="step"><b>03</b><h3>Flat quote</h3><p>One number, written down. If something turns up behind the wall we stop and re-quote rather than run the meter.</p></div>
      <div class="step"><b>04</b><h3>Clean finish</h3><p>Tested, walked through with you, and the work area left the way you handed it over.</p></div>
    </div>
  </div>
</section>
</div>

<!-- ##### SECTION: MARKUP / RELATED ##### -->
<div class="band band-navy">
<section class="sec">
  <div class="wrap">
    <div class="eyebrow" data-rev>Related work</div>
    <div class="rel-grid" data-rev style="margin-top:30px">
      ${rel.map(r => `<a class="rel" href="${r.slug}.html"><b>${r.name}</b><span>${r.short}</span></a>`).join('\n      ')}
    </div>
    <div style="margin-top:34px" data-rev>
      <a class="btn" href="index.html">
        <span class="dot"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6"/></svg></span>
        See every service
      </a>
    </div>
  </div>
</section>
</div>

<!-- ##### SECTION: MARKUP / CTA ##### -->
<div class="band">
<section class="cta-band">
  <div class="wrap" data-rev>
    <div class="eyebrow" style="justify-content:center">Ready when you are</div>
    <h2>Let&rsquo;s get it flowing again.</h2>
    <p>Tell us what it is doing and we will tell you what it takes. No trip charge for a quote in the service area.</p>
    <div class="cta-row">
      <button class="btn btn-solid" type="button" data-book>Book a visit</button>
      <a class="btn btn-ghost" href="tel:${BIZ.tel}">Call ${BIZ.phone}</a>
      <a class="btn btn-ghost" href="sms:${BIZ.tel}">Text us</a>
    </div>
  </div>
</section>
</div>
</main>

${footer(1)}

${stickyBar()}

${scripts(1)}
</body>
</html>
`;
}

/* ---------------------------------------------------------------- index */
function indexPage(){
  return `<!doctype html>
<html lang="en">
<head>
<!-- ##### SECTION: HEAD / SEO ##### -->
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Plumbing Services in the South Bay, CA | Nassim&rsquo;s Plumbing</title>
<meta name="description" content="Every plumbing service we offer across the South Bay - drains, sewers, water heaters, repipes, gas lines, leak detection and more. CA Lic. No ${BIZ.lic}.">
<meta name="theme-color" content="#050d1c">
<link rel="icon" href="../assets/mark.png">
<link rel="apple-touch-icon" href="../assets/mark.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/site.css">
<link rel="stylesheet" href="../assets/ui.css">
</head>
<body>

${topbar()}

${nav(1)}

<main>
<section class="svc-hero">
  <div class="wrap">
    <div data-rev style="max-width:62ch">
      <div class="crumbs"><a href="../index.html">Home</a><span>/</span> Services</div>
      <h1>Everything we do,<br>in one place.</h1>
      <p class="lede">Residential and light commercial plumbing across the South Bay &mdash; Torrance, Inglewood, El Segundo, Gardena, the beach cities and everywhere between. Pick the one that sounds like your problem, or call and describe it and we will work out which it is.</p>
      <div class="cta">
        <a class="btn btn-solid" href="tel:${BIZ.tel}">Call ${BIZ.phone}</a>
        <a class="btn btn-ghost" href="../index.html#area">Service area</a>
      </div>
    </div>
  </div>
</section>

<div class="band">
<section class="sec" style="padding-top:0">
  <div class="wrap">
    <div class="idx-grid" data-rev>
      ${SERVICES.map(s => `<a class="idx" href="${s.slug}.html">
        <svg class="ico" viewBox="0 0 48 48">${s.icon}</svg>
        <h3>${s.name}</h3>
        <p>${s.card}</p>
        <span class="go">Read more</span>
      </a>`).join('\n      ')}
    </div>
  </div>
</section>
</div>

<div class="band band-navy">
<section class="cta-band">
  <div class="wrap" data-rev>
    <div class="eyebrow" style="justify-content:center">Ready when you are</div>
    <h2>Not sure which one you need?</h2>
    <p>That is a normal place to start. Call and describe what it is doing &mdash; we will tell you what it is and what it takes.</p>
    <div class="cta-row">
      <button class="btn btn-solid" type="button" data-book>Book a visit</button>
      <a class="btn btn-ghost" href="tel:${BIZ.tel}">Call ${BIZ.phone}</a>
      <a class="btn btn-ghost" href="sms:${BIZ.tel}">Text us</a>
    </div>
  </div>
</section>
</div>
</main>

${footer(1)}

${stickyBar()}

${scripts(1)}
</body>
</html>
`;
}

/* ---------------------------------------------------------------- write */
fs.mkdirSync(OUT, { recursive: true });
SERVICES.forEach(s => {
  fs.writeFileSync(path.join(OUT, s.slug + '.html'), servicePage(s), 'utf8');
});
fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(), 'utf8');

/* Emit the shared chrome so index.html can be kept in sync by hand. */
fs.writeFileSync(path.join(__dirname, "footer-root.html"), footer(0), 'utf8');
fs.writeFileSync(path.join(__dirname, "nav-root.html"), nav(0), 'utf8');
fs.writeFileSync(path.join(__dirname, "topbar-root.html"), topbar(), 'utf8');
fs.writeFileSync(path.join(__dirname, "sticky-root.html"), stickyBar(), 'utf8');
fs.writeFileSync(path.join(__dirname, "scripts-root.html"), scripts(0), 'utf8');
/* The homepage shows only the calls we actually get most of. Everything else
   lives one click away on services/index.html. */
const FEATURED = [
  'emergency-plumbing', 'drain-cleaning', 'water-heaters',
  'water-leak-detection', 'slab-leak-repair', 'repiping'
];
fs.writeFileSync(path.join(__dirname, "services-grid-root.html"),
  FEATURED.map(sl => BY_SLUG[sl]).map(s => `<a class="idx" href="services/${s.slug}.html">
        <svg class="ico" viewBox="0 0 48 48">${s.icon}</svg>
        <h3>${s.name}</h3>
        <p>${s.card}</p>
        <span class="go">Read more</span>
      </a>`).join('\n      '), 'utf8');

console.log('wrote', SERVICES.length + 1, 'pages to', OUT);
