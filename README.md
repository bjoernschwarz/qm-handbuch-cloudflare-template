# QM-Handbuch – eigene Praxis-Installation

Diese Vorlage installiert die QM-Handbuch-Anwendung vollständig im Cloudflare-Konto der jeweiligen Praxis. Die Praxis besitzt und betreibt ihre eigene Anwendung, Datenbank und Bildablage.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/bjoernschwarz/qm-handbuch-cloudflare-template)

## Was automatisch angelegt wird

- ein eigener Cloudflare Worker für die QM-Handbuch-Anwendung
- eine eigene D1-Datenbank für Praxisdaten, Rollen, Entwürfe und Freigaben
- eine eigene Adresse unter `workers.dev`

Das lizenzierte Musterhandbuch ist **nicht** Bestandteil dieses öffentlichen Installationsgerüsts. Nach der Bereitstellung lädt die Praxisinhaberin oder der Praxisinhaber einmalig das erhaltene `.qmpackage` in die eigene Installation. Danach befinden sich alle Seiten, Hierarchien und Bilder in der eigenen D1-Datenbank im Cloudflare-Konto der Praxis. Ein separates R2-Abonnement ist nicht erforderlich.

## Kundenablauf

1. **In Cloudflare bereitstellen** – oben auf „Deploy to Cloudflare“ klicken, bei `QM_OWNER_EMAIL` die genaue E-Mail-Adresse der Praxisinhaberin oder des Praxisinhabers eintragen und die Bereitstellung im eigenen Cloudflare-Konto bestätigen.
2. **Zugriff einmalig schützen** – in Cloudflare Zero Trust eine Access-Anwendung für die neue `workers.dev`-Adresse anlegen. In der Zugriffsregel unter **Include → Login Methods** ausschließlich **One-time PIN** auswählen.
3. **Erstmals anmelden** – mit genau der bei `QM_OWNER_EMAIL` hinterlegten Adresse anmelden. Nur diese Person kann eine leere Installation als Praxisinhaber:in eröffnen.
4. **Musterhandbuch installieren** – das geschützte `.qmpackage` über die angezeigte Einrichtungsseite auswählen.
5. **Praxis einrichten** – Praxisname, QM-Verantwortung und Team hinterlegen.

Danach wählt die Praxis jederzeit einzelne Musterseiten aus. Jede übernommene Seite beginnt als **Noch nicht freigegeben**, kann angepasst und anschließend für Mitarbeitende freigegeben werden. Mitarbeitende mit der Rolle **Nur lesen** sehen ausschließlich die freigegebene Praxisfassung.

## Cloudflare Access

Die Anwendung verlässt sich auf die von Cloudflare Access bestätigte E-Mail-Adresse. Ohne Access-Anmeldung liefert die Produktivversion keine Praxisdaten aus. Cloudflare Access übernimmt dabei nur die Prüfung der E-Mail-Adresse per Einmalcode.

Wer das Handbuch anschließend tatsächlich sehen oder bearbeiten darf, verwaltet die Praxisinhaberin oder der Praxisinhaber ausschließlich im Handbuch unter **Praxis & Team**. Nicht hinzugefügte Personen erhalten auch nach einer erfolgreichen E-Mail-Prüfung keinen Zugriff auf Praxisdaten. Die Cloudflare-Regel muss daher bei neuen Mitarbeitenden nicht mehr geändert werden.

Die Einstellung `QM_OWNER_EMAIL` schützt eine noch leere Installation: Nur die dort hinterlegte Adresse darf das erste Praxiskonto anlegen. Nach dieser ersten Anmeldung können alle weiteren Personen ausschließlich über **Praxis & Team** freigeschaltet werden.

## Lokale Entwicklung

```sh
pnpm install
pnpm dev
```

Lokal wird ein Beispielkonto als Praxisleitung verwendet. Die Tabellen werden beim ersten Aufruf angelegt. Für die vollständige Vorschau wird anschließend ein gültiges `.qmpackage` importiert.

## Datenschutz und Mandantentrennung

Jede Bereitstellung ist bewusst **Single Tenant**: genau eine Praxis pro Worker und D1-Datenbank. Es gibt keine zentrale Kundendatenbank und keine nachträgliche Verbindung zum Herausgeber des Musterhandbuchs.
