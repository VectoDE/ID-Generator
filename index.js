// index.js

class IDGenerator {
    constructor() {
        // Initialisieren, wenn nötig
    }

    generateID(clubName, roleId, area, year) {
        // Überprüfen, ob alle Eingaben vorhanden sind
        if (!clubName || !roleId || !area || !year) {
            throw new Error('Alle Parameter (clubName, roleId, area, year) sind erforderlich.');
        }

        // Formatieren der ID gemäß den Vorgaben
        return `${clubName}#${roleId}/${area}-${year}`;
    }
}

// Exportiere die Klasse als Modul
module.exports = IDGenerator;