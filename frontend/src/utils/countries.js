import { getCountries, getCountryCallingCode } from "libphonenumber-js";

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryFlag(iso2) {
  return String(iso2 || "")
    .toUpperCase()
    .replace(/[A-Z]/g, (letter) =>
      String.fromCodePoint(127397 + letter.charCodeAt(0)),
    );
}

export const DEFAULT_COUNTRY = {
  name: "Palestine",
  flagEmoji: countryFlag("PS"),
  iso2: "PS",
  iso3: "PSE",
  dialCode: "+970",
  currencies: {},
};

export function getCountryOptions() {
  return getCountries()
    .filter((iso2) => iso2 !== "PS")
    .map((iso2) => {
      const occupied = iso2 === "IL";
      return {
        name: occupied
          ? "Occupied Palestinian Territories"
          : countryNames.of(iso2) || iso2,
        flagEmoji: countryFlag(occupied ? "PS" : iso2),
        iso2,
        iso3: iso2,
        dialCode: `+${getCountryCallingCode(iso2)}`,
        currencies: {},
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
