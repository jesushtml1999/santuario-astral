import fs from "node:fs";
import countries from "i18n-iso-countries";
// Assets distributed under the country-flag-icons MIT license, kept alongside them.
fs.mkdirSync("public/flags", { recursive: true });
for (const code of Object.keys(countries.getAlpha2Codes())) {
  fs.copyFileSync(
    `node_modules/country-flag-icons/3x2/${code}.svg`,
    `public/flags/${code}.svg`,
  );
}
fs.copyFileSync(
  "node_modules/country-flag-icons/LICENSE",
  "public/flags/LICENSE.txt",
);
console.log(
  `Copied ${Object.keys(countries.getAlpha2Codes()).length} local SVG flags.`,
);
