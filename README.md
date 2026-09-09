# QM-Handbuch – eigene Praxis-Installation

Diese Vorlage installiert die QM-Handbuch-Anwendung vollständig im Cloudflare-Konto der jeweiligen Praxis. Die Praxis besitzt und betreibt ihre eigene Anwendung, Datenbank und Bildablage.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bjoernschwarz/qm-handbuch-cloudflare-template)

## Was automatisch angelegt wird

- ein eigener Cloudflare Worker für die QM-Handbuch-Anwendung
- eine eigene D1-Datenbank für Praxisdaten, Rollen, Entwürfe und Freigaben
- eine eigene Adresse unter `workers.dev`

Das lizenzierte Musterhandbuch ist **nicht** Bestandteil dieses öffentlichen Installationsgerüsts. Nach der Bereitstellung lädt die Praxisinhaberin oder der Praxisinhaber einmalig das erhaltene `.qmpackage` in die eigene Installation. Danach befinden sich alle Seiten, Hierarchien und Bilder in der eigenen D1-Datenbank im Cloudflare-Konto der Praxis. Ein separates R2-Abonnement ist nicht erforderlich.

## Kundenablauf

1. **In Cloudflare bereitstellen** – oben auf „Deploy to Cloudflare“ klicken und die Bereitstellung im eigenen Cloudflare-Konto bestätigen.
2. **Zugriff schützen** – in Cloudflare Zero Trust eine Access-Anwendung für die neue `workers.dev`-Adresse anlegen und die E-Mail-Domain der Praxis erlauben.
3. **Erstmals anmelden** – die erste angemeldete Person wird Praxisinhaber:in.
4. **Musterhandbuch installieren** – das geschützte `.qmpackage` über die angezeigte Einrichtungsseite auswählen.
5. **Praxis einrichten** – Praxisname, QM-Verantwortung und Team hinterlegen.

Danach wählt die Praxis jederzeit einzelne Musterseiten aus. Jede übernommene Seite beginnt als **Noch nicht freigegeben**, kann angepasst und anschließend für Mitarbeitende freigegeben werden. Mitarbeitende mit der Rolle **Nur lesen** sehen ausschließlich die freigegebene Praxisfassung.

## Cloudflare Access

Die Anwendung verlässt sich auf die von Cloudflare Access bestätigte E-Mail-Adresse. Ohne Access-Anmeldung liefert die Produktivversion keine Praxisdaten aus. Eine Person muss sowohl in der Access-Regel zugelassen als auch unter **Praxis & Team** vorgemerkt sein.

Für eine typische Praxis genügt eine Regel für die eigene E-Mail-Domain. Externe Mitarbeitende können zusätzlich als einzelne E-Mail-Adresse in Cloudflare Access zugelassen werden.

## Lokale Entwicklung

```sh
pnpm install
pnpm dev
```

Lokal wird ein Beispielkonto als Praxisleitung verwendet. Die Tabellen werden beim ersten Aufruf angelegt. Für die vollständige Vorschau wird anschließend ein gültiges `.qmpackage` importiert.

## Datenschutz und Mandantentrennung

Jede Bereitstellung ist bewusst **Single Tenant**: genau eine Praxis pro Worker und D1-Datenbank. Es gibt keine zentrale Kundendatenbank und keine nachträgliche Verbindung zum Herausgeber des Musterhandbuchs.
