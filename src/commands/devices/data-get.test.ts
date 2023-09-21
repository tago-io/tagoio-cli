import { _createDataFilter } from "./data-get";

describe("createDataFilter", () => {
  it("should create a data filter object with the provided options", () => {
    const options: any = {
      var: ["temperature", "humidity"],
      group: "daily",
      startDate: "2022-01-01",
      endDate: "2022-01-31",
      qty: "100",
      query: "avg",
    };

    const expectedFilter = {
      variables: ["temperature", "humidity"],
      groups: "daily",
      start_date: "2022-01-01",
      end_date: "2022-01-31",
      qty: 100,
      query: "avg",
    };

    const filter = _createDataFilter(options);

    expect(filter).toEqual(expectedFilter);
  });

  it("should create a data filter object with default values when no options are provided", () => {
    const expectedFilter = {};

    const filter = _createDataFilter({} as any);

    expect(filter).toEqual(expectedFilter);
  });
});
