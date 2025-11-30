export enum PropertyType {
    STRING = "string",
    INT = "int",
    FLOAT = "float",
    BOOL = "bool",
}

export interface PropertyRow {
    key: string;
    type: PropertyType;
}

// Struttura salvata nel DB per ogni proprietà del *device*:
// {
//   "maxTemp": { "type": "int", "value": 30 },
//   "label":   { "type": "string", "value": "TEST" }
// }
export interface SavedProperty {
    type: PropertyType;
    value: string | number | boolean;
}

export type SavedProperties = Record<string, SavedProperty>;
