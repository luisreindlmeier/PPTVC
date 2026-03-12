export interface VersionSnapshotMetadata {
  id: string;
  name: string;
  displayName?: string;
  authorName?: string;
  authorEmail?: string;
  tags?: string[];
  timestamp: number;
  filename: string;
  xmlFiles: string[];
}

export interface Version {
  id: string;
  name: string;
  displayName?: string;
  authorName?: string;
  authorEmail?: string;
  tags?: string[];
  timestamp: number;
  filename: string;
  snapshotPath: string;
  metadataPath: string;
}

export interface SaveVersionOptions {
  name?: string;
  tags?: string[];
  authorName?: string;
  authorEmail?: string;
}

export interface UpdateVersionMetaOptions {
  displayName?: string;
  tags?: string[];
}
