import axios, { AxiosRequestConfig } from "axios";

async function editWidgetInfo(accountToken: string, dashboardID: string, widgetID: string, widgetInfo: any) {
  const config: AxiosRequestConfig = {
    method: "PUT",
    url: `https://api.tago.io/dashboard/${dashboardID}/widget/${widgetID}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: accountToken,
    },
    data: widgetInfo,
  };

  return axios(config)
    .then((r) => r.data.result)
    .catch((error) => {
      console.error(config);
      throw error.response.data;
    });
}

export { editWidgetInfo };
