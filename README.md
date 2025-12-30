# TrafSim

Selainpohjainen liikennesimulaattori (HTML/JS + Node.js) yhdellä kaistalla suuntaansa, realistisilla väistösäännöillä, reaktio-/kiihtyvyys-/jarrutusviiveillä, pathfindingillä ja karttaeditorilla.

## Käyttö

```bash
npm install   # mikäli verkko sallii
npm start
```

Avaa selain osoitteessa http://localhost:3000. Editorissa lisää risteyksiä, yhdistä teiksi ja generoi jopa 500 ajoneuvoa. Oletuskartta on yksittäinen nelisuuntainen risteys, johon ajoneuvot tulevat kolmelta sivulta ja väistävät oikealta tulevaa liikennettä. Parametriliukusäätimet vaikuttavat kaikkiin ajoneuvoihin lennossa.

## Ominaisuudet
- Kaksisuuntainen tieverkko yhdellä kaistalla per suunta
- A* -pohjainen reitinhaku risteysverkossa
- Risteysten väistämislogiikka (etuajo-oikeus oikealta ja varaus risteysalueelle)
- Reaktioaika sekä kiihdytys- ja jarrutusrajat
- Karttaeditori (risteysten lisäys, teiden yhdistäminen, risteysten siirtäminen)
- Näytekartta + 500 ajoneuvon massaluonti
- Perusrakenne tuleville liikennevaloille (signalPlan kenttä risteyksissä)
