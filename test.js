const IDGenerator = require('./index');

// Eine Instanz des IDGenerators erstellen
const idGen = new IDGenerator();

// Beispiel-Daten
const clubName = 'HKNET';
const roleId = '1-2';
const area = '1234';
const year = '2024';

// Generiere eine ID
try {
    const id = idGen.generateID(clubName, roleId, area, year);
    console.log('Generierte ID:', id);
} catch (error) {
    console.error('Fehler bei der ID-Generierung:', error.message);
}