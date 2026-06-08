import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(process.cwd(), "data", "languages.json");
// Source-of-truth dataset (read-only, tracked in git at the repo root, since
// data/ is gitignored and regenerated). data/languages.json is the mutable
// working copy that the seed mechanism re-seeds from this file when it changes.
const SEED_FILE = path.join(process.cwd(), "languages-14.json");

app.use(express.json());

type Language = {
  id: string; name: string; parentLanguageId: string | null;
  family: string; branch?: string; approxDate?: string;
  description?: string; region?: string;
};

const SEED_LANGUAGES: Language[] = JSON.parse(fs.readFileSync(SEED_FILE, "utf-8"));

const PLACEHOLDER = [
  // ── INDO-EUROPEAN ────────────────────────────────────────────────────────
  { id: "pie", name: "Proto-Indo-European", parentLanguageId: null, family: "Indo-European", branch: "Root", approxDate: "4500–2500 BC", description: "The reconstructed common ancestor of the Indo-European language family, spoken on the Pontic-Caspian steppe.", region: "Pontic-Caspian steppe" },

  // Anatolian
  { id: "proto-anatolian", name: "Proto-Anatolian", parentLanguageId: "pie", family: "Indo-European", branch: "Anatolian", approxDate: "2500 BC", description: "The earliest branching of PIE, ancestor of Hittite and related Anatolian languages.", region: "Anatolia" },
  { id: "hittite", name: "Hittite", parentLanguageId: "proto-anatolian", family: "Indo-European", branch: "Anatolian", approxDate: "1650 BC", description: "The oldest attested Indo-European language, language of the Hittite Empire.", region: "Central Anatolia" },
  { id: "luwian", name: "Luwian", parentLanguageId: "proto-anatolian", family: "Indo-European", branch: "Anatolian", approxDate: "1400 BC", description: "A sibling of Hittite widely spoken in southern Anatolia and Syria.", region: "Southern Anatolia" },
  { id: "lydian", name: "Lydian", parentLanguageId: "proto-anatolian", family: "Indo-European", branch: "Anatolian", approxDate: "700 BC", description: "Language of the Lydian Kingdom, spoken in western Anatolia until Hellenistic times.", region: "Western Anatolia" },

  // Tocharian
  { id: "proto-tocharian", name: "Proto-Tocharian", parentLanguageId: "pie", family: "Indo-European", branch: "Tocharian", approxDate: "1000 BC", description: "Ancestor of the easternmost attested Indo-European languages, found in the Tarim Basin.", region: "Central Asia" },
  { id: "tocharian-a", name: "Tocharian A", parentLanguageId: "proto-tocharian", family: "Indo-European", branch: "Tocharian", approxDate: "500 AD", description: "Eastern Tocharian, attested in Buddhist manuscripts from the Turfan oasis.", region: "Xinjiang, China" },
  { id: "tocharian-b", name: "Tocharian B", parentLanguageId: "proto-tocharian", family: "Indo-European", branch: "Tocharian", approxDate: "500 AD", description: "Western Tocharian, the more widely attested Tocharian language.", region: "Xinjiang, China" },

  // Germanic
  { id: "p-germanic", name: "Proto-Germanic", parentLanguageId: "pie", family: "Indo-European", branch: "Germanic", approxDate: "500 BC", description: "Ancestor of all Germanic languages, reconstructed from comparative evidence across descendants.", region: "Northern Europe" },
  { id: "gothic", name: "Gothic", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "350 AD", description: "The earliest well-attested Germanic language, preserved in Wulfila's Bible translation.", region: "Eastern Europe" },
  { id: "old-english", name: "Old English", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "450 AD", description: "The earliest form of English brought to Britain by Anglo-Saxon settlers.", region: "England" },
  { id: "english", name: "English", parentLanguageId: "old-english", family: "Indo-European", branch: "Germanic", approxDate: "1100 AD", description: "A West Germanic language transformed by Norman French after 1066, now the global lingua franca.", region: "England" },
  { id: "scots", name: "Scots", parentLanguageId: "old-english", family: "Indo-European", branch: "Germanic", approxDate: "1400 AD", description: "A Germanic language of Scotland, descended from Old English via Northern Middle English.", region: "Scotland" },
  { id: "old-high-german", name: "Old High German", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "750 AD", description: "The ancestor of standard German and other Upper German dialects.", region: "Central Europe" },
  { id: "middle-high-german", name: "Middle High German", parentLanguageId: "old-high-german", family: "Indo-European", branch: "Germanic", approxDate: "1050 AD", description: "The stage of German used in medieval literature, including Minnelied poetry.", region: "Central Europe" },
  { id: "german", name: "German", parentLanguageId: "middle-high-german", family: "Indo-European", branch: "Germanic", approxDate: "1350 AD", description: "A West Germanic language standardized from Early New High German dialects.", region: "Central Europe" },
  { id: "yiddish", name: "Yiddish", parentLanguageId: "middle-high-german", family: "Indo-European", branch: "Germanic", approxDate: "1000 AD", description: "A High German language written in Hebrew script, the historical language of Ashkenazi Jews.", region: "Central and Eastern Europe" },
  { id: "low-german", name: "Low German", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "800 AD", description: "The dialects of northern Germany that did not undergo the High German consonant shift.", region: "Northern Germany" },
  { id: "dutch", name: "Dutch", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "900 AD", description: "A West Germanic language spoken in the Netherlands and northern Belgium.", region: "Low Countries" },
  { id: "afrikaans", name: "Afrikaans", parentLanguageId: "dutch", family: "Indo-European", branch: "Germanic", approxDate: "1700 AD", description: "Developed from 17th-century Dutch settlers in southern Africa; now an official language of South Africa.", region: "Southern Africa" },
  { id: "frisian", name: "West Frisian", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "1400 AD", description: "The closest living relative of English, spoken in Friesland in the Netherlands.", region: "Friesland, Netherlands" },
  { id: "old-norse", name: "Old Norse", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "700 AD", description: "The North Germanic language spoken by Vikings, ancestor of modern Scandinavian languages.", region: "Scandinavia" },
  { id: "swedish", name: "Swedish", parentLanguageId: "old-norse", family: "Indo-European", branch: "Germanic", approxDate: "900 AD", description: "A North Germanic language, the most widely spoken Scandinavian language.", region: "Sweden" },
  { id: "norwegian", name: "Norwegian", parentLanguageId: "old-norse", family: "Indo-European", branch: "Germanic", approxDate: "900 AD", description: "A North Germanic language with two written standards, Bokmål and Nynorsk.", region: "Norway" },
  { id: "danish", name: "Danish", parentLanguageId: "old-norse", family: "Indo-European", branch: "Germanic", approxDate: "800 AD", description: "A North Germanic language that historically dominated Scandinavia.", region: "Denmark" },
  { id: "icelandic", name: "Icelandic", parentLanguageId: "old-norse", family: "Indo-European", branch: "Germanic", approxDate: "870 AD", description: "The most conservative North Germanic language, preserving much of the Old Norse grammar.", region: "Iceland" },
  { id: "faroese", name: "Faroese", parentLanguageId: "old-norse", family: "Indo-European", branch: "Germanic", approxDate: "900 AD", description: "A North Germanic language spoken in the Faroe Islands.", region: "Faroe Islands" },

  // Italic
  { id: "p-italic", name: "Proto-Italic", parentLanguageId: "pie", family: "Indo-European", branch: "Italic", approxDate: "1500 BC", description: "The ancestor of the Italic branch, including Latin and its descendants.", region: "Italian Peninsula" },
  { id: "oscan", name: "Oscan", parentLanguageId: "p-italic", family: "Indo-European", branch: "Italic", approxDate: "400 BC", description: "The major language of southern Italy before Latin displaced it.", region: "Southern Italy" },
  { id: "umbrian", name: "Umbrian", parentLanguageId: "p-italic", family: "Indo-European", branch: "Italic", approxDate: "400 BC", description: "An Italic language of central Italy, attested in the Iguvine Tablets.", region: "Umbria, Italy" },
  { id: "latin", name: "Latin", parentLanguageId: "p-italic", family: "Indo-European", branch: "Italic", approxDate: "700 BC", description: "The language of ancient Rome, which evolved into the Romance languages across Europe.", region: "Latium, Italy" },
  { id: "vulgar-latin", name: "Vulgar Latin", parentLanguageId: "latin", family: "Indo-European", branch: "Italic", approxDate: "200 AD", description: "The colloquial form of Latin spoken by common people across the Roman Empire.", region: "Roman Empire" },
  { id: "french", name: "French", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "800 AD", description: "A Romance language descended from Vulgar Latin, shaped by Frankish influence.", region: "France" },
  { id: "spanish", name: "Spanish", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "900 AD", description: "A Romance language originating in Castile, now one of the most spoken languages worldwide.", region: "Spain" },
  { id: "catalan", name: "Catalan", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "900 AD", description: "A Romance language spoken in Catalonia, Valencia, and the Balearic Islands.", region: "Northeastern Iberia" },
  { id: "occitan", name: "Occitan", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "900 AD", description: "The medieval language of troubadour poetry, still spoken in southern France.", region: "Southern France" },
  { id: "portuguese", name: "Portuguese", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "900 AD", description: "Evolved from Galician-Portuguese in northwest Iberia, now spoken across four continents.", region: "Portugal" },
  { id: "galician", name: "Galician", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "900 AD", description: "A Romance language of northwestern Spain, historically unified with Portuguese.", region: "Galicia, Spain" },
  { id: "italian", name: "Italian", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "960 AD", description: "Closest modern language to Latin, forming primarily from the Tuscan dialect.", region: "Italy" },
  { id: "sardinian", name: "Sardinian", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "900 AD", description: "The most conservative Romance language, preserving many archaic Latin features.", region: "Sardinia" },
  { id: "romansh", name: "Romansh", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "800 AD", description: "A cluster of Romance dialects spoken in the Swiss canton of Graubünden.", region: "Switzerland" },
  { id: "romanian", name: "Romanian", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "600 AD", description: "The easternmost Romance language, preserving many archaic Latin features.", region: "Dacia (modern Romania)" },

  // Hellenic
  { id: "p-hellenic", name: "Proto-Hellenic", parentLanguageId: "pie", family: "Indo-European", branch: "Hellenic", approxDate: "2000 BC", description: "The proto-language ancestor of Ancient Greek and its dialects.", region: "Balkans" },
  { id: "mycenaean-greek", name: "Mycenaean Greek", parentLanguageId: "p-hellenic", family: "Indo-European", branch: "Hellenic", approxDate: "1600 BC", description: "The earliest attested form of Greek, written in Linear B syllabary.", region: "Mycenae, Greece" },
  { id: "ancient-greek", name: "Ancient Greek", parentLanguageId: "p-hellenic", family: "Indo-European", branch: "Hellenic", approxDate: "800 BC", description: "The classical language of Greece, influencing science, philosophy, and theology worldwide.", region: "Greece" },
  { id: "koine-greek", name: "Koine Greek", parentLanguageId: "ancient-greek", family: "Indo-European", branch: "Hellenic", approxDate: "300 BC", description: "The common dialect that spread across the Hellenistic world; the language of the New Testament.", region: "Eastern Mediterranean" },
  { id: "byzantine-greek", name: "Byzantine Greek", parentLanguageId: "koine-greek", family: "Indo-European", branch: "Hellenic", approxDate: "500 AD", description: "The continuation of Koine Greek as the official language of the Byzantine Empire.", region: "Byzantine Empire" },
  { id: "greek", name: "Greek", parentLanguageId: "byzantine-greek", family: "Indo-European", branch: "Hellenic", approxDate: "1000 AD", description: "The modern descendant of Ancient Greek, with continuous written tradition spanning 3,000 years.", region: "Greece" },

  // Slavic
  { id: "p-slavic", name: "Proto-Slavic", parentLanguageId: "pie", family: "Indo-European", branch: "Slavic", approxDate: "300 BC", description: "The common ancestor of all Slavic languages.", region: "Eastern Europe" },
  { id: "old-church-slavonic", name: "Old Church Slavonic", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "860 AD", description: "The first Slavic literary language, created by Saints Cyril and Methodius.", region: "Moravia" },
  { id: "russian", name: "Russian", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1100 AD", description: "An East Slavic language and the most widely spoken Slavic language.", region: "Eastern Europe" },
  { id: "ukrainian", name: "Ukrainian", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1100 AD", description: "An East Slavic language closely related to Russian and Belarusian.", region: "Ukraine" },
  { id: "belarusian", name: "Belarusian", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1200 AD", description: "An East Slavic language spoken in Belarus.", region: "Belarus" },
  { id: "polish", name: "Polish", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1000 AD", description: "A West Slavic language with a complex case system and rich literary tradition.", region: "Poland" },
  { id: "czech", name: "Czech", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1100 AD", description: "A West Slavic language spoken in Bohemia and Moravia.", region: "Czech Republic" },
  { id: "slovak", name: "Slovak", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1100 AD", description: "A West Slavic language closely related to Czech, spoken in Slovakia.", region: "Slovakia" },
  { id: "serbian", name: "Serbian", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1100 AD", description: "A South Slavic language spoken in Serbia and surrounding regions.", region: "Balkans" },
  { id: "croatian", name: "Croatian", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1100 AD", description: "A South Slavic language mutually intelligible with Serbian, the official language of Croatia.", region: "Croatia" },
  { id: "slovenian", name: "Slovenian", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1000 AD", description: "A South Slavic language notable for its dual grammatical number.", region: "Slovenia" },
  { id: "bulgarian", name: "Bulgarian", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "900 AD", description: "A South Slavic language notable for having lost the case system.", region: "Bulgaria" },

  // Baltic
  { id: "proto-baltic", name: "Proto-Baltic", parentLanguageId: "pie", family: "Indo-European", branch: "Baltic", approxDate: "1000 BC", description: "The ancestor of the Baltic languages, most archaic of surviving IE branches.", region: "Eastern Baltic" },
  { id: "old-prussian", name: "Old Prussian", parentLanguageId: "proto-baltic", family: "Indo-European", branch: "Baltic", approxDate: "1400 AD", description: "A now-extinct Baltic language, the most archaic of the recorded Baltic tongues.", region: "Prussia" },
  { id: "lithuanian", name: "Lithuanian", parentLanguageId: "proto-baltic", family: "Indo-European", branch: "Baltic", approxDate: "1400 AD", description: "The most archaic living Indo-European language, preserving features closest to PIE.", region: "Lithuania" },
  { id: "latvian", name: "Latvian", parentLanguageId: "proto-baltic", family: "Indo-European", branch: "Baltic", approxDate: "1500 AD", description: "A Baltic language spoken in Latvia, closely related to Lithuanian.", region: "Latvia" },

  // Celtic
  { id: "p-celtic", name: "Proto-Celtic", parentLanguageId: "pie", family: "Indo-European", branch: "Celtic", approxDate: "1300 BC", description: "The ancestor of Celtic languages including Gaulish, Welsh, and Irish.", region: "Central Europe" },
  { id: "gaulish", name: "Gaulish", parentLanguageId: "p-celtic", family: "Indo-European", branch: "Celtic", approxDate: "300 BC", description: "The Continental Celtic language of the Gauls, spoken across ancient France and northern Italy.", region: "Gaul (France)" },
  { id: "old-irish", name: "Old Irish", parentLanguageId: "p-celtic", family: "Indo-European", branch: "Celtic", approxDate: "600 AD", description: "The earliest form of the Goidelic Celtic languages, attested in ogham inscriptions.", region: "Ireland" },
  { id: "irish", name: "Irish", parentLanguageId: "old-irish", family: "Indo-European", branch: "Celtic", approxDate: "1200 AD", description: "A Goidelic Celtic language, the first official language of Ireland.", region: "Ireland" },
  { id: "scottish-gaelic", name: "Scottish Gaelic", parentLanguageId: "old-irish", family: "Indo-European", branch: "Celtic", approxDate: "1200 AD", description: "A Goidelic language spoken in the Scottish Highlands and Western Isles.", region: "Scotland" },
  { id: "manx", name: "Manx", parentLanguageId: "old-irish", family: "Indo-European", branch: "Celtic", approxDate: "1200 AD", description: "The Goidelic language of the Isle of Man, revived after last native speaker died in 1974.", region: "Isle of Man" },
  { id: "welsh", name: "Welsh", parentLanguageId: "p-celtic", family: "Indo-European", branch: "Celtic", approxDate: "550 AD", description: "A Brittonic Celtic language spoken in Wales, one of Europe's oldest living languages.", region: "Wales" },
  { id: "breton", name: "Breton", parentLanguageId: "p-celtic", family: "Indo-European", branch: "Celtic", approxDate: "600 AD", description: "A Brittonic Celtic language spoken in Brittany, France, brought by migrants from Britain.", region: "Brittany, France" },
  { id: "cornish", name: "Cornish", parentLanguageId: "p-celtic", family: "Indo-European", branch: "Celtic", approxDate: "600 AD", description: "A Brittonic language of Cornwall, extinct in the 18th century and revived in the 20th.", region: "Cornwall, England" },

  // Albanian
  { id: "albanian", name: "Albanian", parentLanguageId: "pie", family: "Indo-European", branch: "Albanian", approxDate: "1462 AD", description: "The sole surviving member of its IE branch, attested only from the 15th century.", region: "Albanian Highlands" },

  // Armenian
  { id: "proto-armenian", name: "Proto-Armenian", parentLanguageId: "pie", family: "Indo-European", branch: "Armenian", approxDate: "1000 BC", description: "The ancestor of the Armenian branch, possibly related to ancient Phrygian.", region: "Eastern Anatolia" },
  { id: "classical-armenian", name: "Classical Armenian", parentLanguageId: "proto-armenian", family: "Indo-European", branch: "Armenian", approxDate: "400 AD", description: "Grabar, the liturgical language of the Armenian Apostolic Church.", region: "Armenian Highlands" },
  { id: "armenian", name: "Armenian", parentLanguageId: "classical-armenian", family: "Indo-European", branch: "Armenian", approxDate: "1100 AD", description: "A language isolate within IE, spoken in Armenia and diaspora communities worldwide.", region: "Armenia" },

  // Indo-Iranian
  { id: "p-indo-iranian", name: "Proto-Indo-Iranian", parentLanguageId: "pie", family: "Indo-European", branch: "Indo-Iranian", approxDate: "2000 BC", description: "Ancestor of both Indo-Aryan and Iranian language branches.", region: "Central Asia" },
  { id: "avestan", name: "Avestan", parentLanguageId: "p-indo-iranian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1200 BC", description: "The liturgical language of Zoroastrianism, preserved in the Avesta.", region: "Bactria" },
  { id: "sogdian", name: "Sogdian", parentLanguageId: "p-indo-iranian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "400 BC", description: "The trade language of the Silk Road, spoken by Sogdian merchants across Central Asia.", region: "Sogdia (modern Uzbekistan)" },
  { id: "pashto", name: "Pashto", parentLanguageId: "p-indo-iranian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "900 AD", description: "An Eastern Iranian language and one of the two official languages of Afghanistan.", region: "Afghanistan / Pakistan" },
  { id: "old-persian", name: "Old Persian", parentLanguageId: "p-indo-iranian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "600 BC", description: "The language of the Achaemenid Empire, attested in royal inscriptions.", region: "Persia" },
  { id: "middle-persian", name: "Middle Persian", parentLanguageId: "old-persian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "300 BC", description: "Pahlavi, the language of the Sasanian Empire and Zoroastrian texts.", region: "Persia" },
  { id: "persian", name: "Persian", parentLanguageId: "middle-persian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "800 AD", description: "A major Iranian language with rich literary tradition spanning over a millennium.", region: "Iran" },
  { id: "dari", name: "Dari", parentLanguageId: "persian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "900 AD", description: "An eastern variety of Persian and official language of Afghanistan.", region: "Afghanistan" },
  { id: "kurdish", name: "Kurdish", parentLanguageId: "old-persian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "900 AD", description: "A Northwestern Iranian language spoken by the Kurds across the Middle East.", region: "Kurdish Highlands" },
  { id: "vedic-sanskrit", name: "Vedic Sanskrit", parentLanguageId: "p-indo-iranian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1500 BC", description: "The oldest attested form of Sanskrit, used in the Vedic hymns.", region: "Indian Subcontinent" },
  { id: "sanskrit", name: "Sanskrit", parentLanguageId: "vedic-sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "600 BC", description: "The classical language of ancient India, used in Hindu, Buddhist, and Jain texts.", region: "Indian Subcontinent" },
  { id: "hindi", name: "Hindi", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1100 AD", description: "An Indo-Aryan language and one of the two official languages of India.", region: "Northern India" },
  { id: "urdu", name: "Urdu", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1100 AD", description: "An Indo-Aryan language written in Nastaliq script, official language of Pakistan.", region: "South Asia" },
  { id: "bengali", name: "Bengali", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1000 AD", description: "An Indo-Aryan language of Bangladesh and West India with a rich literary tradition.", region: "Bengal" },
  { id: "punjabi", name: "Punjabi", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1100 AD", description: "The most widely spoken language of Pakistan and a major language of India.", region: "Punjab" },
  { id: "marathi", name: "Marathi", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1000 AD", description: "An Indo-Aryan language spoken predominantly in Maharashtra, India.", region: "Maharashtra, India" },
  { id: "gujarati", name: "Gujarati", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1200 AD", description: "An Indo-Aryan language of Gujarat, India, and the mother tongue of Mahatma Gandhi.", region: "Gujarat, India" },
  { id: "nepali", name: "Nepali", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1400 AD", description: "An Indo-Aryan language and the official language of Nepal.", region: "Nepal" },
  { id: "sinhala", name: "Sinhala", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "300 BC", description: "An Indo-Aryan language spoken by the Sinhalese people of Sri Lanka.", region: "Sri Lanka" },

  // ── URALIC ───────────────────────────────────────────────────────────────
  { id: "proto-uralic", name: "Proto-Uralic", parentLanguageId: null, family: "Uralic", branch: "Root", approxDate: "7000 BC", description: "The reconstructed ancestor of the Uralic language family.", region: "Ural Mountains" },
  { id: "proto-finnic", name: "Proto-Finnic", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Finnic", approxDate: "1000 BC", description: "The ancestor of Finnish, Estonian, and related Baltic Finnic languages.", region: "Baltic Region" },
  { id: "finnish", name: "Finnish", parentLanguageId: "proto-finnic", family: "Uralic", branch: "Finnic", approxDate: "1200 AD", description: "A Uralic language notable for its 15 grammatical cases and vowel harmony.", region: "Finland" },
  { id: "estonian", name: "Estonian", parentLanguageId: "proto-finnic", family: "Uralic", branch: "Finnic", approxDate: "1200 AD", description: "A Finnic language closely related to Finnish, spoken in Estonia.", region: "Estonia" },
  { id: "northern-saami", name: "Northern Sámi", parentLanguageId: "proto-finnic", family: "Uralic", branch: "Saami", approxDate: "1000 AD", description: "The largest Sámi language, spoken by indigenous people of northern Scandinavia.", region: "Scandinavia" },
  { id: "southern-saami", name: "Southern Sámi", parentLanguageId: "proto-finnic", family: "Uralic", branch: "Saami", approxDate: "1000 AD", description: "A Sámi language spoken in central Scandinavia, with fewer than 700 speakers.", region: "Central Scandinavia" },
  { id: "karelian", name: "Karelian", parentLanguageId: "proto-finnic", family: "Uralic", branch: "Finnic", approxDate: "1200 AD", description: "A Finnic language closely related to Finnish, spoken in Karelia.", region: "Karelia" },
  { id: "hungarian", name: "Hungarian", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Ugric", approxDate: "895 AD", description: "A Uralic language distantly related to Finnish, brought to Central Europe by Magyar tribes.", region: "Hungary" },
  { id: "erzya", name: "Erzya", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Mordvinic", approxDate: "1200 AD", description: "One of two Mordvinic languages, spoken in the Republic of Mordovia, Russia.", region: "Mordovia, Russia" },
  { id: "moksha", name: "Moksha", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Mordvinic", approxDate: "1200 AD", description: "The second Mordvinic language, with three tones and a complex nominal system.", region: "Mordovia, Russia" },
  { id: "meadow-mari", name: "Meadow Mari", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Mari", approxDate: "1200 AD", description: "The literary standard of the Mari language, spoken in Mari El, Russia.", region: "Mari El, Russia" },
  { id: "komi", name: "Komi", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Permic", approxDate: "1300 AD", description: "A Permic Uralic language spoken in the Komi Republic of northern Russia.", region: "Komi Republic, Russia" },
  { id: "udmurt", name: "Udmurt", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Permic", approxDate: "1300 AD", description: "A Permic Uralic language spoken in the Udmurt Republic, Russia.", region: "Udmurt Republic, Russia" },
  { id: "proto-samoyedic", name: "Proto-Samoyedic", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Samoyedic", approxDate: "500 BC", description: "The ancestor of the Samoyedic languages, spoken by nomadic peoples of Siberia.", region: "Siberia" },
  { id: "nenets", name: "Nenets", parentLanguageId: "proto-samoyedic", family: "Uralic", branch: "Samoyedic", approxDate: "1000 AD", description: "The most widely spoken Samoyedic language, spoken by reindeer herders of the Arctic.", region: "Arctic Russia" },
  { id: "selkup", name: "Selkup", parentLanguageId: "proto-samoyedic", family: "Uralic", branch: "Samoyedic", approxDate: "1000 AD", description: "A Samoyedic language of the Ob River region of western Siberia.", region: "Western Siberia" },

  // ── AFROASIATIC ──────────────────────────────────────────────────────────
  { id: "proto-afroasiatic", name: "Proto-Afroasiatic", parentLanguageId: null, family: "Afroasiatic", branch: "Root", approxDate: "10000 BC", description: "The reconstructed ancestor of the Afroasiatic language family, possibly originating in northeast Africa.", region: "Northeast Africa" },
  { id: "proto-semitic", name: "Proto-Semitic", parentLanguageId: "proto-afroasiatic", family: "Afroasiatic", branch: "Semitic", approxDate: "3500 BC", description: "The reconstructed ancestor of all Semitic languages.", region: "Levant / Arabian Peninsula" },
  { id: "akkadian", name: "Akkadian", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "2400 BC", description: "The earliest attested Semitic language, the lingua franca of ancient Mesopotamia.", region: "Mesopotamia" },
  { id: "ugaritic", name: "Ugaritic", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "1400 BC", description: "A Northwest Semitic language from the ancient city of Ugarit on the Syrian coast.", region: "Ugarit, Syria" },
  { id: "phoenician", name: "Phoenician", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "1050 BC", description: "The language of Phoenician traders; its alphabet is the ancestor of most modern scripts.", region: "Levant" },
  { id: "aramaic", name: "Aramaic", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "900 BC", description: "The diplomatic language of the Near East for centuries; the vernacular of Jesus.", region: "Fertile Crescent" },
  { id: "syriac", name: "Syriac", parentLanguageId: "aramaic", family: "Afroasiatic", branch: "Semitic", approxDate: "100 AD", description: "A dialect of Eastern Aramaic and major literary language of early Christianity.", region: "Mesopotamia" },
  { id: "hebrew", name: "Hebrew", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "1000 BC", description: "A Semitic language with a unique revival in the 19th–20th centuries as a spoken tongue.", region: "Canaan" },
  { id: "arabic", name: "Arabic", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "400 AD", description: "A Semitic language with the largest number of speakers, liturgical language of Islam.", region: "Arabian Peninsula" },
  { id: "maltese", name: "Maltese", parentLanguageId: "arabic", family: "Afroasiatic", branch: "Semitic", approxDate: "1000 AD", description: "The only Semitic language written in the Latin script and an EU official language.", region: "Malta" },
  { id: "ge-ez", name: "Ge'ez", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "400 BC", description: "The classical language of Ethiopia and liturgical language of the Ethiopian Orthodox Church.", region: "Axum, Ethiopia" },
  { id: "amharic", name: "Amharic", parentLanguageId: "ge-ez", family: "Afroasiatic", branch: "Semitic", approxDate: "1300 AD", description: "The official language of Ethiopia, the second-most spoken Semitic language in the world.", region: "Ethiopia" },
  { id: "tigrinya", name: "Tigrinya", parentLanguageId: "ge-ez", family: "Afroasiatic", branch: "Semitic", approxDate: "1200 AD", description: "A Semitic language spoken in Eritrea and the Tigray region of Ethiopia.", region: "Eritrea / Tigray" },
  { id: "proto-berber", name: "Proto-Berber", parentLanguageId: "proto-afroasiatic", family: "Afroasiatic", branch: "Berber", approxDate: "3000 BC", description: "The ancestor of the Berber (Amazigh) languages of North Africa.", region: "North Africa" },
  { id: "tamazight", name: "Tamazight", parentLanguageId: "proto-berber", family: "Afroasiatic", branch: "Berber", approxDate: "1000 AD", description: "The standard variety of Berber, co-official language of Morocco.", region: "Morocco" },
  { id: "kabyle", name: "Kabyle", parentLanguageId: "proto-berber", family: "Afroasiatic", branch: "Berber", approxDate: "1000 AD", description: "A Berber language of the Kabylie region of northern Algeria.", region: "Algeria" },
  { id: "old-egyptian", name: "Old Egyptian", parentLanguageId: "proto-afroasiatic", family: "Afroasiatic", branch: "Egyptian", approxDate: "3200 BC", description: "The earliest stage of the Egyptian language, attested in hieroglyphic inscriptions.", region: "Egypt" },
  { id: "coptic", name: "Coptic", parentLanguageId: "old-egyptian", family: "Afroasiatic", branch: "Egyptian", approxDate: "200 AD", description: "The final stage of the Egyptian language, still used as the liturgical language of Coptic Christians.", region: "Egypt" },
  { id: "hausa", name: "Hausa", parentLanguageId: "proto-afroasiatic", family: "Afroasiatic", branch: "Chadic", approxDate: "1000 AD", description: "The most widely spoken Chadic language, a major trade language of West Africa.", region: "West Africa" },
  { id: "somali", name: "Somali", parentLanguageId: "proto-afroasiatic", family: "Afroasiatic", branch: "Cushitic", approxDate: "1000 AD", description: "A Cushitic language and the official language of Somalia.", region: "Horn of Africa" },
  { id: "oromo", name: "Oromo", parentLanguageId: "proto-afroasiatic", family: "Afroasiatic", branch: "Cushitic", approxDate: "1000 AD", description: "A Cushitic language and the most widely spoken language in Ethiopia.", region: "Ethiopia" },

  // ── TURKIC ───────────────────────────────────────────────────────────────
  { id: "proto-turkic", name: "Proto-Turkic", parentLanguageId: null, family: "Turkic", branch: "Root", approxDate: "500 BC", description: "The reconstructed ancestor of the Turkic language family.", region: "Central Asia" },
  { id: "old-turkic", name: "Old Turkic", parentLanguageId: "proto-turkic", family: "Turkic", branch: "Common Turkic", approxDate: "600 AD", description: "Attested in the Orkhon inscriptions, the oldest written Turkic language.", region: "Mongolia" },
  { id: "turkish", name: "Turkish", parentLanguageId: "old-turkic", family: "Turkic", branch: "Oghuz", approxDate: "1100 AD", description: "An Oghuz Turkic language and the official language of Turkey.", region: "Anatolia" },
  { id: "azerbaijani", name: "Azerbaijani", parentLanguageId: "old-turkic", family: "Turkic", branch: "Oghuz", approxDate: "1100 AD", description: "A Turkic language spoken in Azerbaijan and northwestern Iran.", region: "South Caucasus" },
  { id: "turkmen", name: "Turkmen", parentLanguageId: "old-turkic", family: "Turkic", branch: "Oghuz", approxDate: "1100 AD", description: "An Oghuz Turkic language and official language of Turkmenistan.", region: "Central Asia" },
  { id: "uzbek", name: "Uzbek", parentLanguageId: "old-turkic", family: "Turkic", branch: "Karluk", approxDate: "1100 AD", description: "The most widely spoken Turkic language of Central Asia, official language of Uzbekistan.", region: "Central Asia" },
  { id: "uyghur", name: "Uyghur", parentLanguageId: "old-turkic", family: "Turkic", branch: "Karluk", approxDate: "900 AD", description: "A Karluk Turkic language spoken by the Uyghur people of Xinjiang, China.", region: "Xinjiang, China" },
  { id: "kazakh", name: "Kazakh", parentLanguageId: "old-turkic", family: "Turkic", branch: "Kipchak", approxDate: "1200 AD", description: "A Kipchak Turkic language and official language of Kazakhstan.", region: "Kazakhstan" },
  { id: "kyrgyz", name: "Kyrgyz", parentLanguageId: "old-turkic", family: "Turkic", branch: "Kipchak", approxDate: "1200 AD", description: "A Kipchak language and official language of Kyrgyzstan.", region: "Kyrgyzstan" },
  { id: "tatar", name: "Tatar", parentLanguageId: "old-turkic", family: "Turkic", branch: "Kipchak", approxDate: "1300 AD", description: "A Kipchak Turkic language spoken by Tatars, mainly in Tatarstan, Russia.", region: "Tatarstan, Russia" },
  { id: "bashkir", name: "Bashkir", parentLanguageId: "old-turkic", family: "Turkic", branch: "Kipchak", approxDate: "1300 AD", description: "A Turkic language of Bashkortostan, Russia, closely related to Tatar.", region: "Bashkortostan, Russia" },
  { id: "yakut", name: "Yakut (Sakha)", parentLanguageId: "old-turkic", family: "Turkic", branch: "Siberian", approxDate: "1000 AD", description: "A Turkic language of northeastern Siberia notable for its extreme divergence from other Turkic tongues.", region: "Yakutia, Russia" },
  { id: "chuvash", name: "Chuvash", parentLanguageId: "proto-turkic", family: "Turkic", branch: "Oghur", approxDate: "800 AD", description: "The sole surviving Oghur Turkic language, highly divergent from other Turkic languages.", region: "Chuvashia, Russia" },

  // ── SINO-TIBETAN ─────────────────────────────────────────────────────────
  { id: "proto-sino-tibetan", name: "Proto-Sino-Tibetan", parentLanguageId: null, family: "Sino-Tibetan", branch: "Root", approxDate: "4000 BC", description: "The reconstructed ancestor of the Sino-Tibetan family, one of the world's largest.", region: "Yellow River Basin" },
  { id: "old-chinese", name: "Old Chinese", parentLanguageId: "proto-sino-tibetan", family: "Sino-Tibetan", branch: "Sinitic", approxDate: "1250 BC", description: "The oldest attested stage of Chinese, found in oracle bone inscriptions of the Shang dynasty.", region: "Yellow River, China" },
  { id: "middle-chinese", name: "Middle Chinese", parentLanguageId: "old-chinese", family: "Sino-Tibetan", branch: "Sinitic", approxDate: "600 AD", description: "The prestigious literary language of the Tang dynasty, ancestor of all modern Chinese varieties.", region: "China" },
  { id: "mandarin", name: "Mandarin", parentLanguageId: "middle-chinese", family: "Sino-Tibetan", branch: "Sinitic", approxDate: "1300 AD", description: "The most spoken language in the world, the basis of Standard Chinese (Putonghua).", region: "Northern China" },
  { id: "cantonese", name: "Cantonese", parentLanguageId: "middle-chinese", family: "Sino-Tibetan", branch: "Sinitic", approxDate: "1000 AD", description: "A Yue Chinese variety spoken in Guangdong and Hong Kong, preserving many archaic features.", region: "Southern China" },
  { id: "wu-chinese", name: "Wu (Shanghainese)", parentLanguageId: "middle-chinese", family: "Sino-Tibetan", branch: "Sinitic", approxDate: "1000 AD", description: "A Chinese variety spoken around Shanghai and the Yangtze delta region.", region: "Eastern China" },
  { id: "min-chinese", name: "Min (Hokkien)", parentLanguageId: "middle-chinese", family: "Sino-Tibetan", branch: "Sinitic", approxDate: "700 AD", description: "The most diverse group of Chinese varieties, including Hokkien and Teochew.", region: "Fujian, China" },
  { id: "hakka", name: "Hakka", parentLanguageId: "middle-chinese", family: "Sino-Tibetan", branch: "Sinitic", approxDate: "1000 AD", description: "A Chinese variety spoken by the Hakka people of southern China and diaspora.", region: "Southern China" },
  { id: "proto-tibeto-burman", name: "Proto-Tibeto-Burman", parentLanguageId: "proto-sino-tibetan", family: "Sino-Tibetan", branch: "Tibeto-Burman", approxDate: "3000 BC", description: "The ancestor of the Tibetan and Burmese language groups.", region: "Himalayas" },
  { id: "tibetan", name: "Tibetan", parentLanguageId: "proto-tibeto-burman", family: "Sino-Tibetan", branch: "Tibeto-Burman", approxDate: "620 AD", description: "The language of the Tibetan people, with a rich Buddhist literary tradition.", region: "Tibetan Plateau" },
  { id: "burmese", name: "Burmese", parentLanguageId: "proto-tibeto-burman", family: "Sino-Tibetan", branch: "Tibeto-Burman", approxDate: "1050 AD", description: "The official language of Myanmar, written in an abugida script derived from Mon script.", region: "Myanmar" },

  // ── JAPONIC ──────────────────────────────────────────────────────────────
  { id: "proto-japonic", name: "Proto-Japonic", parentLanguageId: null, family: "Japonic", branch: "Root", approxDate: "500 BC", description: "The ancestor of the Japanese and Ryukyuan languages.", region: "Japanese Archipelago" },
  { id: "old-japanese", name: "Old Japanese", parentLanguageId: "proto-japonic", family: "Japonic", branch: "Japanese", approxDate: "700 AD", description: "The earliest attested stage of Japanese, recorded in the Man'yōshū anthology.", region: "Japan" },
  { id: "middle-japanese", name: "Middle Japanese", parentLanguageId: "old-japanese", family: "Japonic", branch: "Japanese", approxDate: "1000 AD", description: "The stage of Japanese during the Heian period, formative for classical literature.", region: "Japan" },
  { id: "japanese", name: "Japanese", parentLanguageId: "middle-japanese", family: "Japonic", branch: "Japanese", approxDate: "1600 AD", description: "The official language of Japan, known for its three interlocking writing systems.", region: "Japan" },
  { id: "ryukyuan", name: "Ryukyuan", parentLanguageId: "proto-japonic", family: "Japonic", branch: "Ryukyuan", approxDate: "700 AD", description: "A group of languages spoken in the Ryukyu Islands (Okinawa), endangered today.", region: "Ryukyu Islands, Japan" },

  // ── KOREANIC ─────────────────────────────────────────────────────────────
  { id: "proto-koreanic", name: "Proto-Koreanic", parentLanguageId: null, family: "Koreanic", branch: "Root", approxDate: "1000 BC", description: "The reconstructed ancestor of Korean and the extinct Jeju language.", region: "Korean Peninsula" },
  { id: "old-korean", name: "Old Korean", parentLanguageId: "proto-koreanic", family: "Koreanic", branch: "Koreanic", approxDate: "600 AD", description: "The earliest attested stage of Korean, recorded in Three Kingdoms period texts.", region: "Korean Peninsula" },
  { id: "middle-korean", name: "Middle Korean", parentLanguageId: "old-korean", family: "Koreanic", branch: "Koreanic", approxDate: "1100 AD", description: "The stage of Korean during the Goryeo and Joseon periods, when Hangul was invented.", region: "Korean Peninsula" },
  { id: "korean", name: "Korean", parentLanguageId: "middle-korean", family: "Koreanic", branch: "Koreanic", approxDate: "1600 AD", description: "A language isolate spoken by 80 million people, written in the phonologically precise Hangul script.", region: "Korean Peninsula" },

  // ── AUSTRONESIAN ─────────────────────────────────────────────────────────
  { id: "proto-austronesian", name: "Proto-Austronesian", parentLanguageId: null, family: "Austronesian", branch: "Root", approxDate: "3500 BC", description: "The ancestor of the world's most geographically widespread language family.", region: "Taiwan" },
  { id: "proto-malayo-polynesian", name: "Proto-Malayo-Polynesian", parentLanguageId: "proto-austronesian", family: "Austronesian", branch: "Malayo-Polynesian", approxDate: "2000 BC", description: "The ancestor of the vast Malayo-Polynesian branch, covering most of the Austronesian world.", region: "Philippines" },
  { id: "malay", name: "Malay", parentLanguageId: "proto-malayo-polynesian", family: "Austronesian", branch: "Malayo-Polynesian", approxDate: "700 AD", description: "A lingua franca of maritime Southeast Asia for centuries, basis of Indonesian and Malaysian.", region: "Malay Peninsula" },
  { id: "indonesian", name: "Indonesian", parentLanguageId: "malay", family: "Austronesian", branch: "Malayo-Polynesian", approxDate: "1928 AD", description: "The standardized form of Malay adopted as the national language of Indonesia.", region: "Indonesia" },
  { id: "javanese", name: "Javanese", parentLanguageId: "proto-malayo-polynesian", family: "Austronesian", branch: "Malayo-Polynesian", approxDate: "800 AD", description: "The language of the Javanese people of Java, with a rich literary tradition.", region: "Java, Indonesia" },
  { id: "tagalog", name: "Tagalog", parentLanguageId: "proto-malayo-polynesian", family: "Austronesian", branch: "Malayo-Polynesian", approxDate: "900 AD", description: "The basis of Filipino, the national language of the Philippines.", region: "Philippines" },
  { id: "cebuano", name: "Cebuano", parentLanguageId: "proto-malayo-polynesian", family: "Austronesian", branch: "Malayo-Polynesian", approxDate: "1000 AD", description: "The most widely spoken language of the central and southern Philippines.", region: "Visayas, Philippines" },
  { id: "malagasy", name: "Malagasy", parentLanguageId: "proto-malayo-polynesian", family: "Austronesian", branch: "Malayo-Polynesian", approxDate: "500 AD", description: "The westernmost Austronesian language, brought to Madagascar by Bornean settlers.", region: "Madagascar" },
  { id: "proto-oceanic", name: "Proto-Oceanic", parentLanguageId: "proto-malayo-polynesian", family: "Austronesian", branch: "Oceanic", approxDate: "1500 BC", description: "The ancestor of the Oceanic languages, spread across Melanesia and Polynesia by Lapita people.", region: "Bismarck Archipelago" },
  { id: "maori", name: "Māori", parentLanguageId: "proto-oceanic", family: "Austronesian", branch: "Oceanic", approxDate: "1300 AD", description: "The language of the indigenous Māori people of New Zealand.", region: "New Zealand" },
  { id: "hawaiian", name: "Hawaiian", parentLanguageId: "proto-oceanic", family: "Austronesian", branch: "Oceanic", approxDate: "400 AD", description: "A Polynesian language of Hawaii, severely endangered but undergoing revitalization.", region: "Hawaii" },
  { id: "fijian", name: "Fijian", parentLanguageId: "proto-oceanic", family: "Austronesian", branch: "Oceanic", approxDate: "1000 AD", description: "An Austronesian language of Fiji, co-official language of the Republic of Fiji.", region: "Fiji" },

  // ── DRAVIDIAN ────────────────────────────────────────────────────────────
  { id: "proto-dravidian", name: "Proto-Dravidian", parentLanguageId: null, family: "Dravidian", branch: "Root", approxDate: "3000 BC", description: "The reconstructed ancestor of the Dravidian family, possibly linked to the Indus Valley Civilization.", region: "South Asia" },
  { id: "old-tamil", name: "Old Tamil", parentLanguageId: "proto-dravidian", family: "Dravidian", branch: "South Dravidian", approxDate: "300 BC", description: "One of the world's longest-surviving classical languages, with Sangam literature spanning millennia.", region: "Tamil Nadu, India" },
  { id: "tamil", name: "Tamil", parentLanguageId: "old-tamil", family: "Dravidian", branch: "South Dravidian", approxDate: "700 AD", description: "A Dravidian language with one of the oldest literary traditions in the world.", region: "Tamil Nadu / Sri Lanka" },
  { id: "malayalam", name: "Malayalam", parentLanguageId: "old-tamil", family: "Dravidian", branch: "South Dravidian", approxDate: "900 AD", description: "A Dravidian language of Kerala, India, known for its rich literary and philosophical tradition.", region: "Kerala, India" },
  { id: "kannada", name: "Kannada", parentLanguageId: "proto-dravidian", family: "Dravidian", branch: "South Dravidian", approxDate: "450 AD", description: "A Dravidian language of Karnataka, India, with a classical literary tradition.", region: "Karnataka, India" },
  { id: "telugu", name: "Telugu", parentLanguageId: "proto-dravidian", family: "Dravidian", branch: "South-Central Dravidian", approxDate: "575 AD", description: "The most widely spoken Dravidian language, often called the Italian of the East for its phonology.", region: "Andhra Pradesh, India" },
  { id: "tulu", name: "Tulu", parentLanguageId: "proto-dravidian", family: "Dravidian", branch: "South Dravidian", approxDate: "1000 AD", description: "A Dravidian language of coastal Karnataka and Kerala, known for its Yakshagana theatre.", region: "Coastal Karnataka, India" },

  // ── NIGER-CONGO ──────────────────────────────────────────────────────────
  { id: "proto-niger-congo", name: "Proto-Niger-Congo", parentLanguageId: null, family: "Niger-Congo", branch: "Root", approxDate: "6000 BC", description: "The ancestor of the largest language family in the world by number of languages.", region: "West Africa" },
  { id: "proto-bantu", name: "Proto-Bantu", parentLanguageId: "proto-niger-congo", family: "Niger-Congo", branch: "Bantu", approxDate: "1000 BC", description: "The ancestor of the Bantu languages, which spread across most of sub-Saharan Africa.", region: "Cameroon / Nigeria border" },
  { id: "swahili", name: "Swahili", parentLanguageId: "proto-bantu", family: "Niger-Congo", branch: "Bantu", approxDate: "800 AD", description: "The most widely spoken African language, a major lingua franca of East Africa.", region: "East Africa" },
  { id: "zulu", name: "Zulu", parentLanguageId: "proto-bantu", family: "Niger-Congo", branch: "Bantu", approxDate: "1700 AD", description: "A Bantu language spoken by the Zulu people, South Africa's most widely spoken home language.", region: "South Africa" },
  { id: "xhosa", name: "Xhosa", parentLanguageId: "proto-bantu", family: "Niger-Congo", branch: "Bantu", approxDate: "1500 AD", description: "A Bantu language known for its click consonants, spoken in South Africa.", region: "South Africa" },
  { id: "shona", name: "Shona", parentLanguageId: "proto-bantu", family: "Niger-Congo", branch: "Bantu", approxDate: "1000 AD", description: "The most widely spoken Bantu language of Zimbabwe.", region: "Zimbabwe" },
  { id: "yoruba", name: "Yoruba", parentLanguageId: "proto-niger-congo", family: "Niger-Congo", branch: "Volta-Niger", approxDate: "1000 AD", description: "A major language of Nigeria, spoken by 50 million people and with a rich oral tradition.", region: "West Africa" },
  { id: "igbo", name: "Igbo", parentLanguageId: "proto-niger-congo", family: "Niger-Congo", branch: "Volta-Niger", approxDate: "1000 AD", description: "A major language of southeastern Nigeria with significant tonal complexity.", region: "Eastern Nigeria" },
  { id: "fula", name: "Fula", parentLanguageId: "proto-niger-congo", family: "Niger-Congo", branch: "Atlantic", approxDate: "1000 AD", description: "A Senegambian language spoken across the Sahel from Senegal to Sudan.", region: "West / Central Africa" },
  { id: "wolof", name: "Wolof", parentLanguageId: "proto-niger-congo", family: "Niger-Congo", branch: "Atlantic", approxDate: "1200 AD", description: "The dominant lingua franca of Senegal, spoken by the majority as a first or second language.", region: "Senegal" },

  // ── AUSTROASIATIC ────────────────────────────────────────────────────────
  { id: "proto-austroasiatic", name: "Proto-Austroasiatic", parentLanguageId: null, family: "Austroasiatic", branch: "Root", approxDate: "4000 BC", description: "The ancestor of an ancient language family spanning South and Southeast Asia.", region: "Southeast Asia" },
  { id: "proto-mon-khmer", name: "Proto-Mon-Khmer", parentLanguageId: "proto-austroasiatic", family: "Austroasiatic", branch: "Mon-Khmer", approxDate: "2000 BC", description: "The ancestor of Mon, Khmer, Vietnamese, and related languages.", region: "Mainland Southeast Asia" },
  { id: "khmer", name: "Khmer", parentLanguageId: "proto-mon-khmer", family: "Austroasiatic", branch: "Mon-Khmer", approxDate: "600 AD", description: "The official language of Cambodia, with the longest continuous script tradition in Southeast Asia.", region: "Cambodia" },
  { id: "mon", name: "Mon", parentLanguageId: "proto-mon-khmer", family: "Austroasiatic", branch: "Mon-Khmer", approxDate: "600 AD", description: "An ancient language of Myanmar whose script was adopted by the Burmese.", region: "Myanmar / Thailand" },
  { id: "vietnamese", name: "Vietnamese", parentLanguageId: "proto-mon-khmer", family: "Austroasiatic", branch: "Mon-Khmer", approxDate: "900 AD", description: "The national language of Vietnam, the most widely spoken Mon-Khmer language.", region: "Vietnam" },
  { id: "proto-munda", name: "Proto-Munda", parentLanguageId: "proto-austroasiatic", family: "Austroasiatic", branch: "Munda", approxDate: "2000 BC", description: "The ancestor of the Munda languages of eastern India.", region: "Eastern India" },
  { id: "santali", name: "Santali", parentLanguageId: "proto-munda", family: "Austroasiatic", branch: "Munda", approxDate: "1000 AD", description: "The most widely spoken Munda language, spoken by the Santal people of eastern India.", region: "Eastern India" },

  // ── KARTVELIAN ───────────────────────────────────────────────────────────
  { id: "proto-kartvelian", name: "Proto-Kartvelian", parentLanguageId: null, family: "Kartvelian", branch: "Root", approxDate: "4000 BC", description: "The ancestor of the South Caucasian language family, unrelated to any other known family.", region: "South Caucasus" },
  { id: "georgian", name: "Georgian", parentLanguageId: "proto-kartvelian", family: "Kartvelian", branch: "Kartvelian", approxDate: "430 AD", description: "The official language of Georgia, with a unique script and rich medieval literary tradition.", region: "Georgia" },
  { id: "mingrelian", name: "Mingrelian", parentLanguageId: "proto-kartvelian", family: "Kartvelian", branch: "Kartvelian", approxDate: "1000 AD", description: "A Kartvelian language spoken by the Mingrelians of western Georgia.", region: "Western Georgia" },
  { id: "svan", name: "Svan", parentLanguageId: "proto-kartvelian", family: "Kartvelian", branch: "Kartvelian", approxDate: "1000 AD", description: "The most archaic Kartvelian language, spoken in the high Caucasus mountains.", region: "Upper Svaneti, Georgia" },

  // ── MONGOLIC ─────────────────────────────────────────────────────────────
  { id: "proto-mongolic", name: "Proto-Mongolic", parentLanguageId: null, family: "Mongolic", branch: "Root", approxDate: "1000 BC", description: "The ancestor of the Mongolic languages of Central Asia.", region: "Central Asia" },
  { id: "middle-mongolian", name: "Middle Mongolian", parentLanguageId: "proto-mongolic", family: "Mongolic", branch: "Mongolic", approxDate: "1200 AD", description: "The language of the Mongol Empire under Genghis Khan, recorded in the Secret History.", region: "Mongolia" },
  { id: "mongolian", name: "Mongolian", parentLanguageId: "middle-mongolian", family: "Mongolic", branch: "Mongolic", approxDate: "1600 AD", description: "The official language of Mongolia, written in Cyrillic in Mongolia and traditional script in Inner Mongolia.", region: "Mongolia" },
  { id: "buryat", name: "Buryat", parentLanguageId: "proto-mongolic", family: "Mongolic", branch: "Mongolic", approxDate: "1000 AD", description: "A Mongolic language spoken by Buryats around Lake Baikal in Russia.", region: "Siberia, Russia" },
  { id: "kalmyk", name: "Kalmyk", parentLanguageId: "proto-mongolic", family: "Mongolic", branch: "Mongolic", approxDate: "1600 AD", description: "A western Mongolic language, the only Mongolic language spoken in Europe.", region: "Kalmykia, Russia" },

  // ── TAI-KADAI ────────────────────────────────────────────────────────────
  { id: "proto-tai-kadai", name: "Proto-Tai-Kadai", parentLanguageId: null, family: "Tai-Kadai", branch: "Root", approxDate: "3000 BC", description: "The ancestor of the Tai-Kadai language family of Southeast Asia.", region: "Southern China" },
  { id: "thai", name: "Thai", parentLanguageId: "proto-tai-kadai", family: "Tai-Kadai", branch: "Tai", approxDate: "1200 AD", description: "The official language of Thailand, a tonal analytic language with an Indic-derived script.", region: "Thailand" },
  { id: "lao", name: "Lao", parentLanguageId: "proto-tai-kadai", family: "Tai-Kadai", branch: "Tai", approxDate: "1300 AD", description: "The official language of Laos, closely related to the Thai language.", region: "Laos" },
  { id: "zhuang", name: "Zhuang", parentLanguageId: "proto-tai-kadai", family: "Tai-Kadai", branch: "Tai", approxDate: "1000 AD", description: "The most spoken non-Mandarin language of China, spoken by the Zhuang people of Guangxi.", region: "Guangxi, China" },

  // ── LANGUAGE ISOLATES & OTHER ─────────────────────────────────────────────
];
// PLACEHOLDER array is unused — SEED_LANGUAGES is loaded from languages-14.json above

function loadLanguages(): Language[] {
  if (!fs.existsSync(DATA_FILE)) return SEED_LANGUAGES;
  // Re-seed if seed file is newer than data file (i.e. seed was updated)
  const seedMtime = fs.statSync(SEED_FILE).mtimeMs;
  const dataMtime = fs.statSync(DATA_FILE).mtimeMs;
  if (seedMtime > dataMtime) {
    saveLanguages(SEED_LANGUAGES);
    console.log(`Seed file updated — re-seeded ${SEED_LANGUAGES.length} languages`);
    return SEED_LANGUAGES;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function saveLanguages(data: Language[]) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(DATA_FILE)) {
  saveLanguages(SEED_LANGUAGES);
  console.log(`Seeded ${SEED_LANGUAGES.length} languages to ${DATA_FILE}`);
}

app.get("/api/languages", (_req, res) => {
  res.json(loadLanguages());
});

app.post("/api/languages", (req, res) => {
  const lang = req.body;
  if (!lang?.id || !lang?.name) {
    return res.status(400).json({ error: "id and name are required" });
  }
  const current = loadLanguages();
  if (current.find((l: { id: string }) => l.id === lang.id)) {
    return res.status(409).json({ error: "language already exists" });
  }
  current.push(lang);
  saveLanguages(current);
  res.status(201).json(lang);
});

// Reset to seed data (useful for development)
app.post("/api/languages/reset", (_req, res) => {
  saveLanguages(SEED_LANGUAGES);
  res.json({ count: SEED_LANGUAGES.length });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`LingaTree server running on http://localhost:${PORT} (${SEED_LANGUAGES.length} languages in seed)`);
  });
}

startServer();
