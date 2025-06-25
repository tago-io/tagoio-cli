import { Account } from "@tago-io/sdk";

async function getAutoDictionaryID(account: Account) {
  const dictionaries = await account.dictionaries.list();

  // console.log(`Found ${dictionaries.length} dictionaries`);
  // console.dir(dictionaries, { depth: null });

  const isAutoDictionary = dictionaries.some((dictionary) => dictionary.slug === "AUTO");
  let autoDictionaryID = "";

  if (!isAutoDictionary) {
    const { dictionary: dictionaryID } = await account.dictionaries.create({ name: "TagoIO Automatic Dictionary", slug: "AUTO", fallback: "en-US" });

    autoDictionaryID = dictionaryID;
    console.log({ dictionaryID });
  } else {
    autoDictionaryID = dictionaries.find((dictionary) => dictionary.slug === "AUTO")?.id as string;
  }

  return autoDictionaryID;
}

export { getAutoDictionaryID };
