export interface Version {
  id: string;
  name: string;
  timestamp: number;
  filename: string;
  snapshotPath: string;
  metadataPath: string;
}

export interface VersionSnapshotMetadata {
  id: string;
  name: string;
  timestamp: number;
  filename: string;
  xmlFiles: string[];
}
