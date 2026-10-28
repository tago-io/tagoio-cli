import type { GenericModuleParams } from "@tago-io/sdk";

interface EnvironmentConfig {
  profileToken: string;
  profileRegion: GenericModuleParams["region"];
  analysisList: { name: string; fileName: string; id: string; path?: string }[];
  widgetList?: { folder: string; dashboard_id: string; widget_id: string }[];
  analysisPath: string;
  buildPath: string;
  widgetPath?: string;
  id: string;
  profileName: string;
  email: string;
}

const DEFAULTS: EnvironmentConfig = {
  profileToken: "fake-token",
  profileRegion: "us-e1",
  analysisList: [],
  analysisPath: "./src/analysis",
  buildPath: "./build",
  id: "profile-id",
  profileName: "Test Profile",
  email: "test@example.com",
};

function makeEnvironmentConfig(overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
  return { ...DEFAULTS, ...overrides };
}

export { makeEnvironmentConfig, type EnvironmentConfig };
