import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

const INITIAL_LANGUAGES = [
  { id: "pie", name: "Proto-Indo-European", parentLanguageId: null, family: "Indo-European", branch: "Root", approxDate: "4500–2500 BC", description: "The reconstructed common ancestor of the Indo-European language family, spoken on the Pontic-Caspian steppe.", region: "Pontic-Caspian steppe" },
  { id: "p-germanic", name: "Proto-Germanic", parentLanguageId: "pie", family: "Indo-European", branch: "Germanic", approxDate: "500 BC", description: "Ancestor of all Germanic languages, reconstructed from comparative evidence across descendants.", region: "Northern Europe" },
  { id: "p-italic", name: "Proto-Italic", parentLanguageId: "pie", family: "Indo-European", branch: "Italic", approxDate: "1500 BC", description: "The ancestor of the Italic branch, including Latin and its descendants.", region: "Italian Peninsula" },
  { id: "p-hellenic", name: "Proto-Hellenic", parentLanguageId: "pie", family: "Indo-European", branch: "Hellenic", approxDate: "2000 BC", description: "The proto-language ancestor of Ancient Greek and its dialects.", region: "Balkans" },
  { id: "p-slavic", name: "Proto-Slavic", parentLanguageId: "pie", family: "Indo-European", branch: "Slavic", approxDate: "300 BC", description: "The common ancestor of all Slavic languages.", region: "Eastern Europe" },
  { id: "p-celtic", name: "Proto-Celtic", parentLanguageId: "pie", family: "Indo-European", branch: "Celtic", approxDate: "1300 BC", description: "The ancestor of Celtic languages including Gaulish, Welsh, and Irish.", region: "Central Europe" },
  { id: "p-indo-iranian", name: "Proto-Indo-Iranian", parentLanguageId: "pie", family: "Indo-European", branch: "Indo-Iranian", approxDate: "2000 BC", description: "Ancestor of both Indo-Aryan and Iranian language branches.", region: "Central Asia" },
  { id: "latin", name: "Latin", parentLanguageId: "p-italic", family: "Indo-European", branch: "Italic", approxDate: "700 BC", description: "The language of ancient Rome, which evolved into the Romance languages across Europe.", region: "Latium, Italy" },
  { id: "vulgar-latin", name: "Vulgar Latin", parentLanguageId: "latin", family: "Indo-European", branch: "Italic", approxDate: "200 AD", description: "The colloquial form of Latin spoken by common people across the Roman Empire.", region: "Roman Empire" },
  { id: "french", name: "French", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "800 AD", description: "A Romance language descended from Vulgar Latin, shaped by Frankish influence.", region: "France" },
  { id: "spanish", name: "Spanish", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "900 AD", description: "A Romance language originating in Castile, now one of the most spoken languages worldwide.", region: "Spain" },
  { id: "portuguese", name: "Portuguese", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "900 AD", description: "Evolved from Galician-Portuguese in northwest Iberia, now spoken across four continents.", region: "Portugal" },
  { id: "italian", name: "Italian", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "960 AD", description: "Closest modern language to Latin, forming primarily from the Tuscan dialect.", region: "Italy" },
  { id: "romanian", name: "Romanian", parentLanguageId: "vulgar-latin", family: "Indo-European", branch: "Romance", approxDate: "600 AD", description: "The easternmost Romance language, preserving many archaic Latin features.", region: "Dacia (modern Romania)" },
  { id: "old-english", name: "Old English", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "450 AD", description: "The earliest form of English brought to Britain by Anglo-Saxon settlers.", region: "England" },
  { id: "english", name: "English", parentLanguageId: "old-english", family: "Indo-European", branch: "Germanic", approxDate: "1100 AD", description: "A West Germanic language transformed by Norman French after 1066, now the global lingua franca.", region: "England" },
  { id: "old-high-german", name: "Old High German", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "750 AD", description: "The ancestor of standard German and other Upper German dialects.", region: "Central Europe" },
  { id: "german", name: "German", parentLanguageId: "old-high-german", family: "Indo-European", branch: "Germanic", approxDate: "1200 AD", description: "A West Germanic language standardized from Early New High German dialects.", region: "Central Europe" },
  { id: "dutch", name: "Dutch", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "900 AD", description: "A West Germanic language spoken in the Netherlands and northern Belgium.", region: "Low Countries" },
  { id: "old-norse", name: "Old Norse", parentLanguageId: "p-germanic", family: "Indo-European", branch: "Germanic", approxDate: "700 AD", description: "The North Germanic language spoken by Vikings, ancestor of modern Scandinavian languages.", region: "Scandinavia" },
  { id: "swedish", name: "Swedish", parentLanguageId: "old-norse", family: "Indo-European", branch: "Germanic", approxDate: "900 AD", description: "A North Germanic language, the most widely spoken Scandinavian language.", region: "Sweden" },
  { id: "norwegian", name: "Norwegian", parentLanguageId: "old-norse", family: "Indo-European", branch: "Germanic", approxDate: "900 AD", description: "A North Germanic language with two written standards, Bokmål and Nynorsk.", region: "Norway" },
  { id: "danish", name: "Danish", parentLanguageId: "old-norse", family: "Indo-European", branch: "Germanic", approxDate: "800 AD", description: "A North Germanic language that historically dominated Scandinavia.", region: "Denmark" },
  { id: "ancient-greek", name: "Ancient Greek", parentLanguageId: "p-hellenic", family: "Indo-European", branch: "Hellenic", approxDate: "800 BC", description: "The classical language of Greece, influencing science, philosophy, and theology worldwide.", region: "Greece" },
  { id: "greek", name: "Greek", parentLanguageId: "ancient-greek", family: "Indo-European", branch: "Hellenic", approxDate: "300 AD", description: "The modern descendant of Ancient Greek, with continuous written tradition spanning 3,000 years.", region: "Greece" },
  { id: "old-church-slavonic", name: "Old Church Slavonic", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "860 AD", description: "The first Slavic literary language, created by Saints Cyril and Methodius.", region: "Moravia" },
  { id: "russian", name: "Russian", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1100 AD", description: "An East Slavic language and the most widely spoken Slavic language.", region: "Eastern Europe" },
  { id: "polish", name: "Polish", parentLanguageId: "p-slavic", family: "Indo-European", branch: "Slavic", approxDate: "1000 AD", description: "A West Slavic language with a complex case system and rich literary tradition.", region: "Poland" },
  { id: "vedic-sanskrit", name: "Vedic Sanskrit", parentLanguageId: "p-indo-iranian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1500 BC", description: "The oldest attested form of Sanskrit, used in the Vedic hymns.", region: "Indian Subcontinent" },
  { id: "sanskrit", name: "Sanskrit", parentLanguageId: "vedic-sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "600 BC", description: "The classical language of ancient India, used in Hindu, Buddhist, and Jain texts.", region: "Indian Subcontinent" },
  { id: "hindi", name: "Hindi", parentLanguageId: "sanskrit", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1100 AD", description: "An Indo-Aryan language and one of the two official languages of India.", region: "Northern India" },
  { id: "avestan", name: "Avestan", parentLanguageId: "p-indo-iranian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "1200 BC", description: "The liturgical language of Zoroastrianism, preserved in the Avesta.", region: "Bactria" },
  { id: "old-persian", name: "Old Persian", parentLanguageId: "p-indo-iranian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "600 BC", description: "The language of the Achaemenid Empire, attested in royal inscriptions.", region: "Persia" },
  { id: "persian", name: "Persian", parentLanguageId: "old-persian", family: "Indo-European", branch: "Indo-Iranian", approxDate: "800 AD", description: "A major Iranian language with rich literary tradition spanning over a millennium.", region: "Iran" },
  { id: "old-irish", name: "Old Irish", parentLanguageId: "p-celtic", family: "Indo-European", branch: "Celtic", approxDate: "600 AD", description: "The earliest form of the Goidelic Celtic languages, attested in ogham inscriptions.", region: "Ireland" },
  { id: "irish", name: "Irish", parentLanguageId: "old-irish", family: "Indo-European", branch: "Celtic", approxDate: "1200 AD", description: "A Goidelic Celtic language, the first official language of Ireland.", region: "Ireland" },
  { id: "welsh", name: "Welsh", parentLanguageId: "p-celtic", family: "Indo-European", branch: "Celtic", approxDate: "550 AD", description: "A Brittonic Celtic language spoken in Wales, one of Europe's oldest living languages.", region: "Wales" },
  { id: "proto-uralic", name: "Proto-Uralic", parentLanguageId: null, family: "Uralic", branch: "Root", approxDate: "7000 BC", description: "The reconstructed ancestor of the Uralic language family.", region: "Ural Mountains" },
  { id: "proto-finnic", name: "Proto-Finnic", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Finnic", approxDate: "1000 BC", description: "The ancestor of Finnish, Estonian, and related Baltic Finnic languages.", region: "Baltic Region" },
  { id: "finnish", name: "Finnish", parentLanguageId: "proto-finnic", family: "Uralic", branch: "Finnic", approxDate: "1200 AD", description: "A Uralic language notable for its 15 grammatical cases and vowel harmony.", region: "Finland" },
  { id: "estonian", name: "Estonian", parentLanguageId: "proto-finnic", family: "Uralic", branch: "Finnic", approxDate: "1200 AD", description: "A Finnic language closely related to Finnish, spoken in Estonia.", region: "Estonia" },
  { id: "hungarian", name: "Hungarian", parentLanguageId: "proto-uralic", family: "Uralic", branch: "Ugric", approxDate: "895 AD", description: "A Uralic language distantly related to Finnish, brought to Central Europe by Magyar tribes.", region: "Hungary" },
  { id: "proto-semitic", name: "Proto-Semitic", parentLanguageId: null, family: "Afroasiatic", branch: "Root", approxDate: "3500 BC", description: "The reconstructed ancestor of all Semitic languages.", region: "Levant / Arabian Peninsula" },
  { id: "akkadian", name: "Akkadian", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "2400 BC", description: "The earliest attested Semitic language, the lingua franca of ancient Mesopotamia.", region: "Mesopotamia" },
  { id: "arabic", name: "Arabic", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "400 AD", description: "A Semitic language with the largest number of speakers, liturgical language of Islam.", region: "Arabian Peninsula" },
  { id: "hebrew", name: "Hebrew", parentLanguageId: "proto-semitic", family: "Afroasiatic", branch: "Semitic", approxDate: "1000 BC", description: "A Semitic language with a unique revival in the 19th–20th centuries as a spoken tongue.", region: "Canaan" },
  { id: "proto-turkic", name: "Proto-Turkic", parentLanguageId: null, family: "Turkic", branch: "Root", approxDate: "500 BC", description: "The reconstructed ancestor of the Turkic language family.", region: "Central Asia" },
  { id: "old-turkic", name: "Old Turkic", parentLanguageId: "proto-turkic", family: "Turkic", branch: "Common Turkic", approxDate: "600 AD", description: "Attested in the Orkhon inscriptions, the oldest written Turkic language.", region: "Mongolia" },
  { id: "turkish", name: "Turkish", parentLanguageId: "old-turkic", family: "Turkic", branch: "Oghuz", approxDate: "1100 AD", description: "An Oghuz Turkic language and the official language of Turkey.", region: "Anatolia" },
  { id: "azerbaijani", name: "Azerbaijani", parentLanguageId: "old-turkic", family: "Turkic", branch: "Oghuz", approxDate: "1100 AD", description: "A Turkic language spoken in Azerbaijan and northwestern Iran.", region: "South Caucasus" },
];

app.get("/api/seed", (_req, res) => {
  res.json(INITIAL_LANGUAGES);
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
    console.log(`LingaTree server running on http://localhost:${PORT}`);
  });
}

startServer();
