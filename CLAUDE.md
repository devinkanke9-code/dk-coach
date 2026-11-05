# Hinweise für Claude

## Zuerst die Plan-Übersicht lesen

Alle Pläne, der aktuelle Stand und das Übergabe-Protokoll stehen im privaten Dokument
**„DK – Alle Pläne“**: https://claude.ai/artifact/U9W9cRnBGz4Edc5FU4yYvS

- Zu Beginn jeder Sitzung lesen (über den Claude-Docs-Connector, nicht per Web-Abruf).
- Vor dem Ende oder kurz vor dem Limit: Stand unter „Jetzt offen“ aktualisieren und eine Zeile
  ins Übergabe-Protokoll schreiben (Datum, Sitzung, was gemacht, was als Nächstes).

## Dieses Repo

- dk-coach ist die **gebaute** Kunden-App „DK Coach“ und wird über GitHub Pages ausgeliefert.
- Die Quelle liegt auf Devins PC (`app/src`, `kunden-app/build.js`). Dateien wie `daten.js`,
  `sw.js` oder `stil.css` erzeugt bzw. kopiert der Build. Wer sie hier von Hand ändert, verliert
  die Änderung beim nächsten Build am PC.
- Das Repo ist **öffentlich**. Keine Pläne, Zahlen, Namen, Verträge oder anderen privaten
  Informationen hier ablegen. Die gehören ins Plan-Dokument.

## akademie/ (DK Akademie als Web-App)

- Kommt **nicht** vom Build am PC. Beim Bauen und Committen der Kunden-App den Ordner
  `akademie/` nicht löschen.
- Einstieg ist `akademie/lernen.html`, nicht `akademie/`. Der Offline-Speicher der Kunden-App
  (`sw.js`) liefert für Seiten auf `/` und `index.html` sonst die Kunden-App aus.
- Die Lektionen liegen verschlüsselt in `inhalt.dkx`. Der Code steht nur im Plan-Dokument und
  darf nie ins Repo.
- Bauen: `DK_AKADEMIE_CODE=… node akademie/bauen.mjs --ak <ak.js> [--artifact <seite.html>]`
  erzeugt `inhalt.dkx`, `sw.js` und die claude.ai-Fassung. `--auspacken <ak.js>` entschlüsselt
  die Lektionen wieder. Die Logik steht in `akademie.js` und gilt für beide Fassungen.
