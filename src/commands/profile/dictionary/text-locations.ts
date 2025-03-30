const textLocationJson = {
  dashLocations: [
    "dashInfo.label",
    "dashInfo.tabs[i].value", //tabs use value instead of label
    "dashInfo.blueprint_devices[i].label", // Blueprint devices name
    "dashInfo.blueprint_devices[i].placeholder", // Blueprint devices placeholder
  ],
  widgetLocations: [
    "widgetInfo.label", // all widgets name
    "widgetInfo.display.header_buttons[i].text", // Header buttons name
    "widgetInfo.display.variables[i].text_content", // Static table text format
    "widgetInfo.display.variables[i].alias", // Chart alias | Dynamic table column name
    "widgetInfo.display.columns[i].alias", // Device List Column name
    "widgetInfo.display.columns[i].buttons[j].confirmation_modal_title", // Device List Control Column label
    "widgetInfo.display.columns[i].buttons[j].confirmation_modal_text", // Device List Control Column message
    "widgetInfo.display.columns[i].buttons[j].confirmation_modal_cancel_text", // Device List Control Column button name
    "widgetInfo.display.columns[i].buttons[j].confirmation_modal_confirm_text", // Device List Control Column button name
    "widgetInfo.display.edit_modal_title", // Edit modal title
    "widgetInfo.display.edit_modal_cancel", // Edit modal cancel
    "widgetInfo.display.edit_modal_save", // Edit modal save
    "widgetInfo.display.edit_modal_toast_text", // Edit modal toast
    "widgetInfo.display.total_rows_text", // Total rows text
    "widgetInfo.display.buttons[i].text", // Button name (e.g. "Save" | "Submit" for forms)
    "widgetInfo.sections[i].description", // Section description
    "widgetInfo.sections[i].title", // Section title
    "widgetInfo.sections[i].fields[j].label", // Field label
    "widgetInfo.sections[i].fields[j].placeholder", // Field placeholder
    "widgetInfo.sections[i].fields[j].options[k].label", // Dropdown input options
  ],
};

textLocationJson;
