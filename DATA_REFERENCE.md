# Data reference (starting numbers)

These are the tuned numbers from the reference game. Mass is in kg, cost in $M, power in W (solar `kw` is kW at 1 AU), antenna `rate` is a relative downlink rate, distances in AU, delta-v in km/s, time in years. Start from these, then rebalance with the auto-build check in TESTING.md. Rocket and part names are made up.

Constants: structure = 0.1 × parts mass, tank = 0.08 × fuel, RTG decay = 0.016 per year, heater = 60 W beyond 3 AU (half that inside).

## Difficulty

| key | label | budgetMult | events | retries | tolerance | simple | desc |
|---|---|---|---|---|---|---|---|
| rookie | Beginner | 1.5 | 1 | 3 | 1.7 | true | Start here. Extra money, fuel fills itself, a coach tells you what to do next, and easy piloting. |
| cadet | Cadet | 1.3 | 1 | 2 | 1.4 |  | More money, gentler piloting, two retries on landings. |
| engineer | Engineer | 1 | 2 | 1 | 1 |  | Realistic budgets and one retry on landings. |
| director | Flight Director | 0.85 | 3 | 0 | 0.75 |  | Tight money, harder piloting, no retries. |
| sandbox | Sandbox | ∞ | 0 | 9 | 1.4 |  | Every mission and part unlocked, no budget limit. |

## Spacecraft buses

| key | name | bays | core | side | mass | cost | desc |
|---|---|---|---|---|---|---|---|
| small | Small bus | 3 | 4 | 2 | 120 | 80 | 3 instrument bays, 4 internal slots, 2 side mounts. |
| medium | Medium bus | 5 | 5 | 4 | 200 | 130 | 5 instrument bays, 5 internal slots, 4 side mounts. |
| large | Large bus | 7 | 6 | 6 | 320 | 200 | 7 instrument bays, 6 internal slots, 6 side mounts. |

## Parts

| id | slot | cat | name | mass | cost | power | data | isp | kw | watts | wh | rate | gb | agility | mult | unlock | kind | extra | desc |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| chem | engine | Propulsion | Bipropellant engine | 60 | 30 |  |  | 320 |  |  |  |  |  |  |  | 1 |  |  | Strong, simple thrust. Isp 320 s. |
| chemHi | engine | Propulsion | High-performance engine | 80 | 60 |  |  | 345 |  |  |  |  |  |  |  | 3 |  |  | Isp 345 s: about 8% less fuel than the basic engine. |
| ion | engine | Propulsion | Ion engine | 140 | 110 |  |  | 2500 |  |  |  |  |  |  |  | 3 |  | minPower=500, slow=true | Isp 2,500 s, so it needs very little fuel. Gentle thrust adds time, and it needs 500 W at the target. |
| capsule | top | Landing & return | Return capsule | 90 | 60 |  |  |  |  |  |  |  |  |  |  | 3 |  |  | Heat shield and parachutes. Lands samples and the recorder on Earth. |
| lander | bottom | Landing & return | Surface lander | 180 | 140 |  | 400 |  |  |  |  |  |  |  |  | 2 |  |  | You pilot it down to any site, even the poles. Heavy and expensive. |
| sampler | bay | Landing & return | Sample collector arm | 40 | 80 | 20 | 10 |  |  |  |  |  |  |  |  | 3 |  |  | Touch-and-go arm or plume catcher. Samples only count if the capsule lands. |
| solarS | side | Power | Solar wing (6 m²) | 30 | 10 |  |  |  | 2 |  |  |  |  |  |  | 1 |  |  | 2 kW at Earth's distance from the Sun. Less farther out. |
| solarL | side | Power | Solar wing (15 m²) | 75 | 22 |  |  |  | 5 |  |  |  |  |  |  | 1 |  |  | 5 kW at Earth's distance. A bigger target for debris. |
| solarX | side | Power | Giant solar wing (30 m²) | 160 | 45 |  |  |  | 10 |  |  |  |  |  |  | 4 |  |  | 10 kW at Earth's distance. Huge, heavy and easy to hit. |
| rtg | side | Power | RTG (nuclear power) | 55 | 90 |  |  |  |  | 150 |  |  |  |  |  | 4 |  |  | 150 W day or night, anywhere. Loses 1.6% a year. Expensive. |
| batS | core | Power | Battery (600 Wh) | 8 | 4 |  |  |  |  |  | 600 |  |  |  |  | 1 |  |  | Carries you through shadows and emergencies. |
| batL | core | Power | Battery (2,000 Wh) | 25 | 11 |  |  |  |  |  | 2000 |  |  |  |  | 2 |  |  | Three times the energy of the small battery. |
| fuelcell | core | Power | Emergency fuel cell | 35 | 25 |  |  |  |  |  | 3000 |  |  |  |  | 4 |  | emergency=true | A one-time 3,000 Wh boost you start during an emergency. |
| lga | antenna | Comms | Low-gain antenna | 3 | 3 | 20 |  |  |  |  |  | 1 |  |  |  | 1 |  | hl=0 | Tiny and light. Very slow far from Earth. |
| mga | antenna | Comms | Medium dish (1.5 m) | 20 | 15 | 45 |  |  |  |  |  | 12 |  |  |  | 1 |  | hl=1 | 12× faster than the low-gain antenna. |
| hga | antenna | Comms | High-gain dish (3 m) | 55 | 40 | 70 |  |  |  |  |  | 50 |  |  |  | 1 |  | hl=2 | 50× faster than the low-gain antenna. |
| ka | antenna | Comms | Ka-band dish (4 m) | 85 | 70 | 100 |  |  |  |  |  | 140 |  |  |  | 4 |  | hl=3 | The best link money can buy. |
| compStd | core | Avionics | Standard computer | 8 | 10 | 15 |  |  |  |  |  |  |  |  |  | 1 | computer | radHard=false | Cheap. Radiation can crash it. |
| compRad | core | Avionics | Rad-hard computer | 12 | 35 | 20 |  |  |  |  |  |  |  |  |  | 4 | computer | radHard=true | Shielded against radiation near giant planets. |
| adcsBasic | core | Avionics | Reaction wheels | 20 | 15 | 25 |  |  |  |  |  |  |  | 1 | 1 | 1 | adcs | spare=false | Points the spacecraft. No spare wheel. |
| adcsPrecise | core | Avionics | Precision pointing | 32 | 35 | 35 |  |  |  |  |  |  |  | 1.35 | 1.1 | 3 | adcs | spare=true | Spare wheel and star trackers. +10% science and quicker steering. |
| rec32 | core | Avionics | 32 Gb recorder | 2 | 3 | 4 |  |  |  |  |  |  | 32 |  |  | 1 | recorder |  | Small data buffer. |
| rec256 | core | Avionics | 256 Gb recorder | 4 | 8 | 6 |  |  |  |  |  |  | 256 |  |  | 1 | recorder |  | Medium data buffer. |
| rec2t | core | Avionics | 2 Tb recorder | 8 | 20 | 10 |  |  |  |  |  |  | 2000 |  |  | 5 | recorder |  | Holds everything. |
| shield | core | Avionics | Debris shield | 25 | 12 |  |  |  |  |  |  |  |  |  |  | 1 |  |  | Whipple shield layers. Each one absorbs 2 debris hits during the cruise. |
| wac | bay | Science | Wide-angle camera | 12 | 25 | 10 | 400 |  |  |  |  |  |  |  |  | 1 |  |  | Maps large areas. |
| hirc | bay | Science | High-res camera | 30 | 60 | 18 | 1500 |  |  |  |  |  |  |  |  | 1 |  |  | Sees small details from a low orbit. Huge images. |
| irs | bay | Science | Infrared spectrometer | 22 | 50 | 15 | 800 |  |  |  |  |  |  |  |  | 1 |  |  | Reads the chemical fingerprint of ice, rock and organics, and measures heat. |
| mag | bay | Science | Magnetometer | 5 | 12 | 4 | 20 |  |  |  |  |  |  |  |  | 1 |  |  | Light and cheap. Measures magnetic fields. |
| sig | bay | Science | Radio receiver | 15 | 30 | 12 | 300 |  |  |  |  |  |  |  |  | 2 |  |  | Listens for the Ceruvia signal. |
| radar | bay | Science | Ground-penetrating radar | 35 | 70 | 40 | 1200 |  |  |  |  |  |  |  |  | 4 |  |  | Sees through ice and soil to buried water. Power hungry. |
| mspec | bay | Science | Mass spectrometer | 18 | 55 | 25 | 100 |  |  |  |  |  |  |  |  | 4 |  | low=true | "Tastes" gas. Needs a low orbit. |

## Launch vehicles

| key | name | leo | cost | boosters | desc |
|---|---|---|---|---|---|
| sparrow | Sparrow-1 | 5000 | 90 |  | Small and cheap. |
| condor | Condor | 11000 | 170 |  | The deep-space workhorse. |
| albatross | Albatross H | 21000 | 320 | true | Heavy lift with side boosters. |
| leviathan | Leviathan SH | 40000 | 600 | true | Super-heavy. Eats budgets. |

## Ground stations

| key | name | hours | cost | desc |
|---|---|---|---|---|
| single | One ground station | 4 | 5 | A single dish. The spacecraft is only in view a few hours a day, and Earth's spin hides it the rest of the time. |
| network | Three-station network | 8 | 20 | Dishes spread around the world, like NASA's Deep Space Network in California, Spain and Australia, so one can always see you. You share them with other missions. |
| priority | Network with priority time | 16 | 45 | You book the big dishes for twice as long each day. Doubles the data you can send. Expensive. |

## Missions

### 1. Shakedown (Earth orbit)

au 1 · comm 400 · capFactor 1 · budget $440M · ops $2M/month · a science pass every 1 months · ops months [min, max, default] [3,8,4] · hazard 0 · needReturn false

Minigames: launch

Objectives:
- **regions**: Photograph 3 different regions of Earth  (check: `R => R.sitesWithFinds >= 3`)
- **climate**: Measure the climate at 2 regions with the infrared spectrometer  (check: `R => (R.tags.climate || 0) >= 2`)
- **poles**: Observe a polar ice sheet  (check: `R => R.found.has('e-green-wac') || R.found.has('e-ant-wac') || R.found.has('e-green-irs')`)

Critical resources: **Budget**: Your first mission has the smallest budget. The rocket is the biggest cost. **Power**: Low orbits spend part of every lap in Earth's shadow, so the battery matters.

Trajectories:

| key | name | lf | dvIns | dvDep | cruise | desc |
|---|---|---|---|---|---|---|
| leo | Direct to orbit | 1 | 0.05 | 0 | 0 | The rocket puts you straight into orbit. |

Orbits:

| key | name | dv | cap | eclipse | dataFactor | detail | radRisk | maxLat | desc |
|---|---|---|---|---|---|---|---|---|---|
| leo | Low Earth orbit (28° tilt) | 0 | 1 | 0.38 | 1 | true | 0.002 | 30 | The easiest orbit to reach. Only passes over the tropics, and spends 38% of each orbit in Earth's shadow. |
| sso | Sun-synchronous polar orbit | 0.15 | 0.85 | 0 | 1 | true | 0.004 | 90 | Flies over both poles and follows the line between day and night, so it never enters shadow. The rocket carries 15% less. |

Sites: Amazon Rainforest, Sahara Desert, Greenland Ice Sheet, Antarctic Ice Shelf, Pacific Typhoon (each has discoveries per instrument: {id, tag, pts, title, why}). Clue categories: Maps, Climate, Magnetic field.

Story (intro):
- vega: Welcome to Mission Control. Three weeks ago our antennas caught a faint, repeating radio pulse from Ceruvia, an icy moon 1.4 billion km away.
- hale: It might come from somewhere with water and warmth. Places like that could host life. But the signal is fading.
- vega: Nobody will fund a trip to Ceruvia until this team proves it can fly. Your first job: build a small Earth-watching satellite and get it working.
- ollie: Drag parts from the shelf onto the spacecraft. Every part adds mass, cost and power. Then you fly the launch yourself. No pressure.

### 2. Quiet Side (The Moon)

au 1 · comm 120 · capFactor 0.4 · budget $670M · ops $3M/month · a science pass every 1 months · ops months [min, max, default] [3,8,4] · hazard 0.5 · needReturn false

Minigames: launch, dodge, insertion, landing

Objectives:
- **signal**: Record the Ceruvia signal from the far side  (check: `R => (R.tags.signal || 0) >= 1`)
- **water**: Find water ice at the south pole  (check: `R => (R.tags.water || 0) >= 1`)
- **land**: Land the lander safely  (check: `R => R.landed`)

Critical resources: **Communications**: The far side of the Moon never faces Earth, so radio contact is tricky. **Mass**: A lander is heavy, and the Moon is harder to reach than Earth orbit.

Trajectories:

| key | name | lf | dvIns | dvDep | cruise | desc |
|---|---|---|---|---|---|---|
| direct | Direct transfer | 1 | 0.9 | 0 | 0.012 | Fast. You arrive quickly but must brake hard. |
| weak | Low-energy transfer | 1.1 | 0.65 | 0 | 0.3 | A long loop that uses the Sun's gravity. Saves fuel and the rocket carries 10% more. |

Orbits:

| key | name | dv | cap | eclipse | dataFactor | detail | radRisk | maxLat | desc |
|---|---|---|---|---|---|---|---|---|---|
| eq | Low equatorial orbit | 0 |  | 0.4 | 1 | true | 0.003 | 30 | Cheap, but misses the poles. |
| polar | Low polar orbit | 0.12 |  | 0.35 | 1 | true | 0.003 | 90 | Sees the whole Moon, including the dark polar craters. |

Sites: Daedalus Crater (far side), Shackleton Crater, Sea of Tranquility, Tycho Crater, Sea of Rains (each has discoveries per instrument: {id, tag, pts, title, why}). Clue categories: The signal, Water ice, History, Geology.

Story (intro):
- hale: Earth is full of radio noise: phones, TV, radar. The Ceruvia signal is buried under it.
- hale: The far side of the Moon always faces away from Earth. It is the quietest radio spot in the solar system.
- vega: Land a lander on the far side, or fly a radio receiver around behind the Moon, and record the signal cleanly.
- ollie: New parts unlocked: a lander, a radio receiver, a bigger battery and a large bus. You fly the lander yourself, so go easy on the throttle.

### 3. Pebble Run (Asteroid 2031 QX)

au 1.1 · comm 40 · capFactor 0.32 · budget $920M · ops $3M/month · a science pass every 1 months · ops months [min, max, default] [2,6,4] · hazard 0.75 · needReturn true

Minigames: launch, dodge, insertion, tag, reentry

Objectives:
- **tag**: Grab a sample with a touch-and-go  (check: `R => R.tagOk`)
- **home**: Land the capsule on Earth with the sample  (check: `R => R.capsuleLanded && R.tagOk`)
- **water**: Find evidence of ancient water  (check: `R => (R.tags.water || 0) >= 1`)

Critical resources: **Fuel and mass**: You have to stop at the asteroid and come all the way back. **Budget**: A capsule and a sample arm are expensive.

Trajectories:

| key | name | lf | dvIns | dvDep | cruise | desc |
|---|---|---|---|---|---|---|
| direct | Direct rendezvous | 1 | 1.6 | 1.2 | 1 | Match the asteroid's orbit directly. Costs a lot of Δv. |
| flyby | Earth flyby assist | 1.15 | 1.1 | 1 | 1.8 | Loop past Earth once for a free boost. Slower, but cheaper in fuel. |

Orbits:

| key | name | dv | cap | eclipse | dataFactor | detail | radRisk | maxLat | desc |
|---|---|---|---|---|---|---|---|---|---|
| hover | Hover at 20 km | 0 |  | 0 | 0.7 | false | 0.001 | 90 | Safe and simple. The asteroid spins beneath you, so you see all of it, but not in detail. |
| close | Close orbit at 2 km | 0.03 |  | 0.15 | 1 | true | 0.001 | 70 | Sharp images. The weak gravity makes this orbit tricky, and the poles are out of view. |

Sites: Boulder Field, Smooth Pond, Equatorial Ridge, North Pit, Dark Streak (each has discoveries per instrument: {id, tag, pts, title, why}). Clue categories: Ancient water, Organics, Structure, Sample.

Story (intro):
- vega: To prove life on Ceruvia, we will need samples in Earth labs. That means a capsule that survives hitting the atmosphere at 12 km/s.
- hale: Asteroid 2031 QX is a dark, carbon-rich rock. Its chemistry may be a lot like Ceruvia's dark basin.
- ollie: You will touch the surface for three seconds, grab a sample, and back away. Then bring it home. New: capsule, sampler arm, ion engine, precision pointing.

### 4. Red Shadow (Mars)

au 1.52 · comm 14 · capFactor 0.3 · budget $1120M · ops $4M/month · a science pass every 2 months · ops months [min, max, default] [4,16,8] · hazard 0.9 · needReturn false

Minigames: launch, dodge, insertion, landing + power crisis (solar cut 0.95, RTG cut 0, 8 turns)

Objectives:
- **ice**: Find buried water with radar  (check: `R => R.found.has('m-arc-radar') || R.found.has('m-pol-radar') || R.found.has('m-arc-land')`)
- **storm**: Survive the dust storm without losing data  (check: `R => R.crisisClean`)
- **land**: Land the lander safely  (check: `R => R.landed`)

Critical resources: **Power**: Mars gets less than half of Earth's sunlight, and a dust storm is coming. **Data**: Mars is far, so the radio link is slow.

Trajectories:

| key | name | lf | dvIns | dvDep | cruise | desc |
|---|---|---|---|---|---|---|
| hohmann | Transfer + braking burn | 1 | 2.1 | 0 | 0.7 | The classic route. Braking into orbit costs a lot of fuel. |
| aero | Transfer + aerobraking | 1 | 0.9 | 0 | 1.2 | Dip into the upper atmosphere hundreds of times to slow down for free. Takes months longer. |

Orbits:

| key | name | dv | cap | eclipse | dataFactor | detail | radRisk | maxLat | desc |
|---|---|---|---|---|---|---|---|---|---|
| high | High orbit | 0 |  | 0.05 | 0.7 | false | 0.002 | 60 | Calm and almost always in sunlight, but too far for detail. |
| eq | Low equatorial orbit | 0.3 |  | 0.38 | 1 | true | 0.003 | 40 | Close-up views of the middle latitudes. |
| polar | Low polar orbit | 0.45 |  | 0.35 | 1 | true | 0.003 | 90 | Sees every latitude, including the ice caps. |

Sites: Jezero Crater, South Polar Cap, Valles Marineris, Olympus Mons, Arcadia Planitia (each has discoveries per instrument: {id, tag, pts, title, why}). Clue categories: Water, Organics & methane, Geology.

Story (intro):
- vega: Ceruvia is so far from the Sun that solar power barely works there. We need a power system that cannot be switched off by the weather.
- hale: Mars is perfect for testing that. Its dust storms can cover the whole planet for weeks. And we still do not know how much ice is buried there.
- ollie: New: RTGs, ground-penetrating radar, a mass spectrometer, giant solar wings, a Ka-band dish, a rad-hard computer and an emergency fuel cell.

### 5. Last Signal (Ceruvia)

au 9.5 · comm 1 · capFactor 0.29 · budget $1420M · ops $5M/month · a science pass every 2 months · ops months [min, max, default] [4,24,12] · hazard 1 · needReturn true · deadline 7.5 years

Minigames: launch, dodge, insertion, landing, reentry + power crisis (solar cut 0.7, RTG cut 0.45, 8 turns)

Objectives:
- **habit**: Confirm 3 of the 5 habitability clues  (check: `R => R.clueCount >= 3`)
- **signal**: Find the source of the signal  (check: `R => (R.tags.signal || 0) >= 1`)
- **home**: Land the capsule on Earth  (check: `R => R.capsuleLanded`)

Critical resources: **Power**: Sunlight at Ceruvia is 90 times weaker than at Earth. **Time**: The signal fades in 7.5 years, so the trip must be fast. **Communications**: Data trickles home from 1.4 billion km away.

Trajectories:

| key | name | lf | dvIns | dvDep | cruise | desc |
|---|---|---|---|---|---|---|
| direct | Direct transfer | 1 | 2 | 2 | 5 | Fast, but you arrive going very fast and need a lot of fuel to brake. |
| assist | Jupiter gravity assist | 1.2 | 1.3 | 1.4 | 7 | Swing past Jupiter for free speed. Saves fuel and the rocket carries 20% more, but it takes 2 years longer. |

Orbits:

| key | name | dv | cap | eclipse | dataFactor | detail | radRisk | maxLat | desc |
|---|---|---|---|---|---|---|---|---|---|
| high | High orbit | 0 |  | 0 | 0.7 | false | 0.01 | 60 | Cheap and safe from radiation. Too far for close-ups or plume fly-throughs. |
| low | Low equatorial orbit | 0.6 |  | 0.15 | 1 | true | 0.04 | 45 | Close-up views of the middle latitudes. Heavy radiation from the gas giant. |
| polar | Low polar orbit | 0.9 |  | 0.3 | 1 | true | 0.025 | 90 | Sees every latitude, including the plumes at the south pole. |

Sites: Fracture Canyons, Plume Fields, Beacon Crater, Northern Ice Cap, Dark Basin (each has discoveries per instrument: {id, tag, pts, title, why}). Clue categories: Water, Food & energy, Shelter, The signal, Signs of life.

Story (intro):
- vega: This is it. Ceruvia: 1.4 billion km away, sunlight 90 times weaker than at Earth, and a signal that fades for good in 7.5 years.
- hale: We want to know if Ceruvia has water, food and shelter, what makes the signal, and whether anything lives there.
- ollie: Every part is unlocked. You need to arrive before the signal fades, survive the trip home, and land the capsule. Good luck, team.

## Random events

- **flare**: Solar storm. A burst of charged particles from the Sun sweeps past the spacecraft.
- **wheel**: Reaction wheel failure. One of the spinning wheels that points the spacecraft has stopped.
- **leak**: Thruster valve leak. A valve did not close fully after a course correction.
- **dsn**: Ground antenna outage. A storm damaged one of the big dishes on Earth that listen to your spacecraft.
- **budget**: Budget review. The agency has to cut costs and asks every mission to give money back.
- **debris**: Debris warning. Tracking stations spot a cloud of old satellite fragments crossing your path.
- **detour**: Asteroid flyby opportunity. An unexplored asteroid passes close to your path. A small detour would let you photograph it.

## Science goals (who uses the data)

- **regions**: Mapmakers, farmers and disaster responders. Parts: wac, hirc, irs. Any instrument that finds something at three different places counts. A wide-angle camera is the cheapest way.
- **climate**: Climate scientists tracking heat, drought and forests. Any instrument with tag "climate". Infrared light shows temperature and plant health.
- **poles**: Glaciologists measuring how fast ice is melting. Parts: wac, irs. Orbit: polar. You need an orbit that flies over the poles, and a camera or spectrometer.
- **signal**: Radio astronomers studying the mystery pulse. Any instrument with tag "signal". Listening needs a radio receiver, or a lander parked on the quiet side.
- **water**: Planetary scientists, and future astronauts who will need water. Any instrument with tag "water". Different instruments find water in different ways: infrared, radar, or digging with a lander.
- **land**: Engineers planning future landings. Parts: lander. You need the surface lander, and you have to fly it down yourself.
- **tag**: Scientists studying how the planets formed. Parts: sampler. The sample collector arm grabs the pebbles during a touch-and-go.
- **home**: Lab scientists on Earth with instruments too big to fly. Parts: capsule. Only a return capsule with a heat shield can bring anything back to Earth.
- **ice**: Future Mars explorers looking for water to drink and make fuel. Parts: radar, lander. Ground-penetrating radar sees ice under the soil. A lander can dig for it.
- **storm**: Mission operations engineers who keep spacecraft alive. Parts: rtg, batL, fuelcell. Dust blocks sunlight. An RTG, a big battery or a fuel cell keeps the lights on.
- **habit**: Astrobiologists searching for places life could exist. Parts: irs, radar, hirc, mag, lander, sampler, mspec. Each clue needs a different instrument, so a mix works best.
