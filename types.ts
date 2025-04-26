export type EntityType = {
    id: string;
    name: string;
    conditions: string,
    healthPoints: CharacterBar,
    magicPoints: CharacterBar,
    equipmentPoints: CharacterBar,
    imgSource: string,
    status: CharacterStatus,
    statsVisibleByPlayers: boolean,
    turnDone?: boolean
}

export type CharacterBar = {
    currentValue: number,
    maxValue: number
}

export type CharacterStatus = 'alive' | 'unconscious' | 'dead';
export type EntityState = 'alive' | 'unconscious' | 'dead' | 'visible-stats';

export type MainStateType = {
  allies: EntityType[],
  foes: EntityType[],
}

export type EntityRequestData = {
    name: string;
    hp: string;
    mp: string;
    pe: string;
    entityType: 'ally' | 'foe';
    imgSource: string;
}

export type EditEntityRequestPayload = {
  barType: "MP" | "HP" | "PE" | "conditions" | "imgSource" | "name"
  valueType: 'current' | 'max'
  value: string,
  entityID: string
}

export type ChangeEntityStateRequestPayload = {
  entityID: string,
  newState: EntityState
}

export type DeleteEntityRequestPayload = {
  entityID: string,
}

export type BarAttributeName = 'healthPoints' | 'magicPoints' | 'equipmentPoints'
