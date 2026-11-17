---
titulo: PeWoNu, wellbeing for astronauts on long missions
desc: NASA Space Apps Challenge 2026 prototype that compares each astronaut against their own baseline and shares with the ground base only what the astronaut chooses to send.
estado: prueba-de-concepto
organizacion: NASA Space Apps Challenge 2026
fecha: 2026-11
destacado: true
st:
  - Python
  - Flet
  - FastAPI
  - SQLite
  - GitHub Actions
kw:
  - astronaut health
  - personal baseline
  - HL7 FHIR
  - offline
  - bilingual
  - hackathon
repo: https://github.com/MrT-coder/pewonu
demo: https://pewonu.jbmllnube.com/
cv:
  - Led a five-person team in a two-day NASA Space Apps Challenge 2026 hackathon and built a health monitoring prototype for astronauts.
  - Implemented comparison of each astronaut against their own baseline using deterministic rules, with no AI in the alert path.
  - Packaged the data the astronaut chooses to send as an HL7 FHIR R4 Bundle and checked it with the official HL7 validator.
  - Built the ground base with FastAPI and SQLite, and an offline-capable app with Flet.
---
I led a team of five people in a two-day hackathon, on November 14 and 15, 2026, for the challenge "Create Health Monitoring Software for Astronauts on Space Missions" of the NASA Space Apps Challenge. We built a prototype of two systems: an app for the astronaut and a ground base. All data is simulated and the prototype does not diagnose.

![Astronaut app: body figure colored by the status of each system, mission ring and data panel](/media/pewonu-app.jpg "The astronaut app, with the fictional crew of the simulated scenario.")

## Comparing each person against their own baseline

Each astronaut is compared against their own history, not a population average. Each body system is colored according to that baseline and turns gray when there is not enough data to judge: an honest gray is better than a green the system cannot back up. There is no AI model in the alert path; the rules are deterministic and are explained in plain language.

## Sharing only what the astronaut confirms

Nothing leaves the astronaut without their confirmation. What they choose to send is packaged as an HL7 FHIR R4 Bundle, which we checked against the official HL7 validator. The ground base, built with FastAPI and SQLite, validates it and shows it only after a simulated communication delay (12 minutes by default, configurable from 0 to 22), so the interface reflects the distance instead of pretending to be real time.

![Ground base: crew members, what needs attention, and received packages](/media/pewonu-base-tierra.jpg "The ground base only sees what the crew decided to send.")

## Working without internet

The app runs on Flet and a local server, with the data in SQLite on the same machine. A test on November 14 showed that offline mode only works with the `no_cdn=True` option; without it the interface does not render. For that reason, once installed, the system does not depend on a connection. It installs with a single command, which the project page explains for Windows, macOS and Linux.

## A voice that is not kept

Voice logging is optional: the audio is discarded on the device and only numeric acoustic measurements are stored. No emotion is inferred.

## Result

At the local venue we did not win, but we took part and stepped out of our comfort zone. The worldwide result has not been published yet. Still pending are routine reminders, the emergency screen, the adherence streak, and saving the meal log to the database, which currently lives in memory. The use of AI in the project is declared in the repository's README.

![Galactic Problem Solver certificate from the NASA Space Apps Challenge 2026, issued to Josue Bladimir Morales Llanganate](/media/nasa-space-apps-2026-certificado.png "Participation certificate, November 14 and 15, 2026.")

There is a [7-slide presentation](/media/pewonu-presentacion.pdf) with a summary of the project.
