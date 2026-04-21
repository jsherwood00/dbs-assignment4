export interface TrainStation {
  code: string;
  name: string;
  tz?: string;
  arr?: string | null;
  dep?: string | null;
  schArr?: string | null;
  schDep?: string | null;
  status?: string | null;
  platform?: string | null;
  bus?: boolean;
}

export interface Train {
  id: string;
  train_num: number;
  route_name: string;
  lat: number | null;
  lon: number | null;
  heading: string | null;
  velocity: number | null;
  status: string | null;
  origin_code: string | null;
  dest_code: string | null;
  stations: TrainStation[] | null;
  last_updated: string;
}

export interface SavedPair {
  id: string;
  user_id: string;
  from_code: string;
  from_name: string;
  to_code: string;
  to_name: string;
  created_at: string;
}

export interface AmtrakerStation {
  code: string;
  name: string;
  city?: string;
  state?: string;
  lat?: number;
  lon?: number;
}
