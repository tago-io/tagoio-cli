import { Account } from "@tago-io/sdk";

interface IDictionaryContent {
  [key: string]: string;
}

async function editAutoDictionaryContent(account: Account, dictionaryID: string, content: IDictionaryContent) {
  //get the current values in the dictionary
  const dictionaryLanguageInfo = await account.dictionaries.languageInfo(dictionaryID, "en-US");

  //TODO: Maybe sort the dictionary alphabetically before saving it

  //overwrite the dictionary with the new values in the object
  await account.dictionaries.languageEdit(dictionaryID, "en-US", { active: true, dictionary: { ...dictionaryLanguageInfo, ...content } });
}

export { editAutoDictionaryContent, IDictionaryContent };
