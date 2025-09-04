import { editWidgetInfo } from "./edit-widget-info";
import { generateDictionaryKey } from "./generate-dictionary-key";
import { isDictionaryString } from "./is-dictionary-string";

async function getWidgetDictionary(accountToken: string, dashboardID: string, widgetID: string, widgetInfo: any) {
  const widgetDictionaries: string[] = [];

  const widgetLabel = widgetInfo.label;
  const isWidgetLabelDictionary = isDictionaryString(widgetLabel);
  if (!isWidgetLabelDictionary) {
    const dictKey = generateDictionaryKey(widgetLabel);
    widgetDictionaries.push(widgetLabel);
    // widgetDictionaryContent[dictKey] = widgetLabel;
    widgetInfo.label = `#AUTO.${dictKey}#`;
  }

  const widgetHeaderButtonsText = [];
  for (const button of widgetInfo.display.header_buttons) {
    if (button.text !== undefined) {
      const isWidgetButtonDictionary = isDictionaryString(button.text);

      if (!isWidgetButtonDictionary) {
        widgetHeaderButtonsText.push(button.text);
        const dictKey = generateDictionaryKey(button.text);
        button.text = `#AUTO.${dictKey}#`;
      }
    }
  }

  const widgetVariablesTextContent = [];
  const widgetVariablesAlias = [];

  if (widgetInfo.display.variables) {
    for (const variable of widgetInfo.display.variables) {
      if (variable.text_content !== undefined) {
        const isWidgetVariableTextContentDictionary = isDictionaryString(variable.text_content);

        if (!isWidgetVariableTextContentDictionary) {
          widgetVariablesTextContent.push(variable.text_content);
          const dictKey = generateDictionaryKey(variable.text_content);
          variable.text_content = `#AUTO.${dictKey}#`;
        }
      }

      if (variable.alias !== undefined) {
        const isWidgetVariableAliasDictionary = isDictionaryString(variable.alias);

        if (!isWidgetVariableAliasDictionary) {
          widgetVariablesAlias.push(variable.alias);
          const dictKey = generateDictionaryKey(variable.alias);
          variable.alias = `#AUTO.${dictKey}#`;
        }
      }
    }
  }

  const widgetColumnsAlias = [];
  if (widgetInfo.display.columns) {
    for (const column of widgetInfo.display.columns) {
      if (column.alias !== undefined) {
        const isWidgetColumnAliasDictionary = isDictionaryString(column.alias);

        if (!isWidgetColumnAliasDictionary) {
          widgetColumnsAlias.push(column.alias);
          const dictKey = generateDictionaryKey(column.alias);
          column.alias = `#AUTO.${dictKey}#`;
        }
      }

      if (column.buttons) {
        for (const button of column.buttons) {
          if (button.confirmation_modal_title !== undefined) {
            const isWidgetButtonDictionary = isDictionaryString(button.confirmation_modal_title);

            if (!isWidgetButtonDictionary) {
              const dictKey = generateDictionaryKey(button.confirmation_modal_title);
              button.confirmation_modal_title = `#AUTO.${dictKey}#`;
            }
          }

          if (button.confirmation_modal_text !== undefined) {
            const isWidgetButtonDictionary = isDictionaryString(button.confirmation_modal_text);

            if (!isWidgetButtonDictionary) {
              const dictKey = generateDictionaryKey(button.confirmation_modal_text);
              button.confirmation_modal_text = `#AUTO.${dictKey}#`;
            }
          }

          if (button.confirmation_modal_cancel_text !== undefined) {
            const isWidgetButtonDictionary = isDictionaryString(button.confirmation_modal_cancel_text);

            if (!isWidgetButtonDictionary) {
              const dictKey = generateDictionaryKey(button.confirmation_modal_cancel_text);
              button.confirmation_modal_cancel_text = `#AUTO.${dictKey}#`;
            }
          }

          if (button.confirmation_modal_confirm_text !== undefined) {
            const isWidgetButtonDictionary = isDictionaryString(button.confirmation_modal_confirm_text);

            if (!isWidgetButtonDictionary) {
              const dictKey = generateDictionaryKey(button.confirmation_modal_confirm_text);
              button.confirmation_modal_confirm_text = `#AUTO.${dictKey}#`;
            }
          }
        }
      }
    }
  }

  const widgetEditModalTitle = [];
  const widgetEditModalCancel = [];
  const widgetEditModalSave = [];
  const widgetEditModalToastText = [];

  if (widgetInfo.display.edit_modal) {
    for (const modal of widgetInfo.display.edit_modal) {
      if (modal.title !== undefined) {
        const isWidgetModalTitleDictionary = isDictionaryString(modal.title);

        if (!isWidgetModalTitleDictionary) {
          widgetEditModalTitle.push(modal.title);
          const dictKey = generateDictionaryKey(modal.title);
          modal.title = `#AUTO.${dictKey}#`;
        }
      }

      if (modal.cancel !== undefined) {
        const isWidgetModalCancelDictionary = isDictionaryString(modal.cancel);

        if (!isWidgetModalCancelDictionary) {
          widgetEditModalCancel.push(modal.cancel);
          const dictKey = generateDictionaryKey(modal.cancel);
          modal.cancel = `#AUTO.${dictKey}#`;
        }
      }

      if (modal.save !== undefined) {
        const isWidgetModalSaveDictionary = isDictionaryString(modal.save);

        if (!isWidgetModalSaveDictionary) {
          widgetEditModalSave.push(modal.save);
          const dictKey = generateDictionaryKey(modal.save);
          modal.save = `#AUTO.${dictKey}#`;
        }
      }

      if (modal.toast_text !== undefined) {
        const isWidgetModalToastTextDictionary = isDictionaryString(modal.toast_text);

        if (!isWidgetModalToastTextDictionary) {
          widgetEditModalToastText.push(modal.toast_text);
          const dictKey = generateDictionaryKey(modal.toast_text);
          modal.toast_text = `#AUTO.${dictKey}#`;
        }
      }
    }
  }

  const widgetTotalRowsText = [];
  if (widgetInfo.display.total_rows_text !== undefined) {
    const isWidgetTotalRowsTextDictionary = isDictionaryString(widgetInfo.display.total_rows_text);

    if (!isWidgetTotalRowsTextDictionary) {
      widgetTotalRowsText.push(widgetInfo.display.total_rows_text);
      const dictKey = generateDictionaryKey(widgetInfo.display.total_rows_text);
      widgetInfo.display.total_rows_text = `#AUTO.${dictKey}#`;
    }
  }

  const widgetButtonsText = [];
  if (widgetInfo.display.buttons) {
    for (const button of widgetInfo.display.buttons) {
      if (button.text !== undefined) {
        const isWidgetButtonDictionary = isDictionaryString(button.text);

        if (!isWidgetButtonDictionary) {
          widgetButtonsText.push(button.text);
          const dictKey = generateDictionaryKey(button.text);
          button.text = `#AUTO.${dictKey}#`;
        }
      }
    }
  }

  const widgetSectionsDescription = [];
  const widgetSectionsTitle = [];
  const widgetSectionsFieldsLabel = [];
  const widgetSectionsFieldsPlaceholder = [];
  const widgetSectionsFieldsOptionsLabel = [];
  if (widgetInfo.sections) {
    for (const section of widgetInfo.sections) {
      if (section.description !== undefined) {
        const isWidgetSectionDescriptionDictionary = isDictionaryString(section.description);

        if (!isWidgetSectionDescriptionDictionary) {
          widgetSectionsDescription.push(section.description);
          const dictKey = generateDictionaryKey(section.description);
          section.description = `#AUTO.${dictKey}#`;
        }
      }

      if (section.title !== undefined) {
        const isWidgetSectionTitleDictionary = isDictionaryString(section.title);

        if (!isWidgetSectionTitleDictionary) {
          widgetSectionsTitle.push(section.title);
          const dictKey = generateDictionaryKey(section.title);
          section.title = `#AUTO.${dictKey}#`;
        }
      }

      for (const field of section.fields) {
        if (field.label !== undefined) {
          const isWidgetFieldLabelDictionary = isDictionaryString(field.label);

          if (!isWidgetFieldLabelDictionary) {
            widgetSectionsFieldsLabel.push(field.label);
            const dictKey = generateDictionaryKey(field.label);
            field.label = `#AUTO.${dictKey}#`;
          }
        }

        if (field.placeholder !== undefined) {
          const isWidgetFieldPlaceholderDictionary = isDictionaryString(field.placeholder);

          if (!isWidgetFieldPlaceholderDictionary) {
            widgetSectionsFieldsPlaceholder.push(field.placeholder);
            const dictKey = generateDictionaryKey(field.placeholder);
            field.placeholder = `#AUTO.${dictKey}#`;
          }
        }

        for (const option of field.options) {
          if (option.label !== undefined) {
            const isWidgetFieldOptionLabelDictionary = isDictionaryString(option.label);

            if (!isWidgetFieldOptionLabelDictionary) {
              widgetSectionsFieldsOptionsLabel.push(option.label);
              const dictKey = generateDictionaryKey(option.label);
              option.label = `#AUTO.${dictKey}#`;
            }
          }
        }
      }
    }
  }
  // }

  widgetDictionaries.push(
    ...widgetHeaderButtonsText,
    ...widgetVariablesTextContent,
    ...widgetVariablesAlias,
    ...widgetColumnsAlias,
    ...widgetEditModalTitle,
    ...widgetEditModalCancel,
    ...widgetEditModalSave,
    ...widgetEditModalToastText,
    ...widgetTotalRowsText,
    ...widgetButtonsText,
    ...widgetSectionsDescription,
    ...widgetSectionsTitle,
    ...widgetSectionsFieldsLabel,
    ...widgetSectionsFieldsPlaceholder,
    ...widgetSectionsFieldsOptionsLabel
  );

  await editWidgetInfo(accountToken, dashboardID, widgetID, widgetInfo);
}

export { getWidgetDictionary };
