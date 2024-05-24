import axios, { AxiosRequestConfig } from "axios";

async function getWidgetInfo(dashboardID: string, widgetID: string, accountToken: string) {
  const config: AxiosRequestConfig = {
    method: "GET",
    url: `https://api.tago.io/dashboard/${dashboardID}/widget/${widgetID}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: accountToken,
    },
  };

  return axios(config)
    .then((r) => r.data.result)
    .catch((error) => {
      console.error(config);
      throw error.response.data;
    });
}

export { getWidgetInfo };
