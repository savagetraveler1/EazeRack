export type RackUnits = 12 | 24 | 42 | 48;

export type DeviceType = 'network' | 'compute' | 'storage' | 'power' | 'other';

export interface RackDevice {
  id: string;
  name: string;
  type: DeviceType;
  heightU: number;
  startU: number;
  notes?: string;
}

export interface RackProject {
  id: string;
  name: string;
  rackUnits: RackUnits;
  devices: RackDevice[];
  updatedAtIso: string;
}
