import * as uuid from "jsr:@std/uuid";
import { EntityRequestData, EntityType, MainStateType, DeleteEntityRequestPayload, EditEntityRequestPayload } from "./types.ts";
import {BarAttributeName, CharacterBar, ChangeEntityStateRequestPayload, GameState} from "./types.ts";
import { isUserGM, getUserID } from "./system.ts";
import { setState, MainState } from "./state.ts";
import { AssetEditPayload } from "./types.ts";

//TODO: prepare some middleware to reduce code multiplication e.g. const newState = {...gameState.current};

const MAIN_STATE_SOCKET_KEY = 'entities-state';
const barsRequestMap: {[key: string]: BarAttributeName} = {
  "HP": "healthPoints",
  "MP": "magicPoints",
  "PE": "equipmentPoints"
};



function isKeyInEntity(key: string){
  return ['name', 'conditions', 'healthPoints', 'magicPoints', 'equipmentPoints'].includes(key)
          ||
         ['imgSource', 'status', 'statsVisibleByPlayers', 'affiliation', 'turnDone'].includes(key);
}



export function editEntity(gameState:GameState, id: string, key: string, value: string, barType: undefined | string = undefined): GameState{
  if (!key || !id || !key || !value) return gameState;
  if (!isKeyInEntity(key)) return gameState;
  const newState = {...gameState};
  if (key.includes('Points')) return editEnityPoints(gameState, id, key, value, barType);
  const entityToEdit = newState.entities.find(ent => ent.id === id);
  if (!entityToEdit) return gameState;
  if (['statsVisibleByPlayers', 'turnDone'].includes(key)){
    entityToEdit[key] = !entityToEdit[key];
    return newState;
  }
  entityToEdit[key] = value;
  return newState;
}

export function deleteEntity(gameState:GameState, id: string): GameState{
  if (!id) return gameState;
  const newState = {...gameState};
  newState.entities = newState.entities.filter(entity => entity.id !== id);
  return newState;
}

export function appendEntity(gameState:GameState, payload: AssetEditPayload): GameState{
  const entityData = payload.newEntityData;
  if (!entityData) return gameState;
  if (!entityData.hp || !entityData.mp || !entityData.pe || !entityData.name || !entityData.imgSource) return gameState;
  const newEntity: EntityType = {
    id: uuid.v1.generate(),
    name: entityData.name,
    conditions: '',
    healthPoints: {currentValue: parseInt(entityData.hp), maxValue: parseInt(entityData.hp)},
    magicPoints: {currentValue: parseInt(entityData.mp), maxValue: parseInt(entityData.mp)},
    equipmentPoints: {currentValue: parseInt(entityData.pe), maxValue: parseInt(entityData.pe)},
    imgSource: entityData.imgSource,
    status: 'alive',
    statsVisibleByPlayers: false,
    affiliation: entityData.affilation
}

const newState = {...gameState};
newState.entities.push(newEntity);
return newState;
}

function editEnityPoints(gameState:GameState, id: string, key: string, value: string, barType: undefined | string = undefined): GameState{
  if (!barType) return gameState;
  if (barType !== "MP" && barType !== "HP" && barType !== "PE") return gameState;
  const [currentValue, maxValue] = value.split('/');
  if (!maxValue) return gameState;
  return handleBarChange(gameState, id, currentValue, maxValue, barType);
}

function handleBarChange(gameState: GameState, id: string, currentValue: string, maxValue: string, barType: string): GameState{
  if (!isBarValueLegit(currentValue) || !isBarValueLegit(maxValue)) return gameState;
  const newState = {...gameState};
  const entityToEdit = newState.entities.find(ent => ent.id === id);
  if (!entityToEdit) return gameState;
  const attributeName = barsRequestMap[barType];
  if (!attributeName) return gameState;
  const currentBar : CharacterBar = entityToEdit[attributeName];
  const previousCurrent = currentBar.currentValue;
  const previousMax = currentBar.currentValue;
  const newMaxProposition = getNewBarPayloadValue(maxValue, previousMax);
  const newCurrentProposition = getNewBarPayloadValue(currentValue, previousCurrent);
  const newCurrent = newCurrentProposition >= 0? newCurrentProposition : 0;
  const newMax = newMaxProposition >= 0 ? newMaxProposition : 0;
  if (newCurrent > newMax){
    currentBar.currentValue = newMax;
    currentBar.maxValue = newMax;
  } else{
    currentBar.currentValue = newCurrent;
    currentBar.maxValue = newMax;
  }
  return newState;
}

function isBarValueLegit(value: string){
  const firstSign = value.charAt(0);
  if (isNaN(Number(firstSign)))
    if (!["-", "+"].includes(firstSign)) return false;

  const parsedValue = value.substring(1);
  return !isNaN(Number(parsedValue));
}


// function entityEditAfterWare(io, gameState:MainState, newState: GameState){
//     io.emit(MAIN_STATE_SOCKET_KEY, newState);
//     return setState(gameState, newState);
// }


// function handleNewEntity(userID: string, newEntity: EntityRequestData, gameState: MainState, io){
//     const {...entity} = newEntity;
//     if (!isUserGM(userID)) return gameState;
//     return appendEntity(entity, gameState, io);
// }


// function appendEntity(entityData: EntityRequestData, gameState: MainState, io){
//     const newEntity: EntityType = {
//         id: uuid.v1.generate(),
//         name: entityData.name,
//         conditions: '',
//         healthPoints: {currentValue: parseInt(entityData.hp), maxValue: parseInt(entityData.hp)},
//         magicPoints: {currentValue: parseInt(entityData.mp), maxValue: parseInt(entityData.mp)},
//         equipmentPoints: {currentValue: parseInt(entityData.pe), maxValue: parseInt(entityData.pe)},
//         imgSource: entityData.imgSource,
//         status: 'alive',
//         statsVisibleByPlayers: false
//     }

//     const stateKey = entityData.entityType === 'foe'? 'foes': 'allies';
//     const newState = {...gameState.current};
//     newState[stateKey].push(newEntity);
//     return entityEditAfterWare(io, gameState, newState);
// }

function handleEntityDeletion(userID: string, payload: DeleteEntityRequestPayload, gameState: MainState, io){
    if (!isUserGM(userID)) return gameState;
    return deleteEntity(io, payload.entityID, gameState);
  }

// function deleteEntity(io, entityID: string, gameState: MainState){
//     const newState = {...gameState.current};
//     newState.allies = newState.allies.filter(entity => entity.id !== entityID);
//     newState.foes = newState.foes.filter(entity => entity.id !== entityID);
//     return entityEditAfterWare(io, gameState, newState);
// }
  
  function handleEntityChangeState(userID: string, payload: ChangeEntityStateRequestPayload, gameState: MainState, io){
    if (!isUserGM(userID)) return gameState;
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(payload.entityID, newState);
    if (!entityToChange) return gameState;
  
    if (payload.newState === 'visible-stats'){
      entityToChange.statsVisibleByPlayers = !entityToChange.statsVisibleByPlayers;
    } 
    else entityToChange.status = payload.newState;
  
    if (payload.newState === 'dead' || payload.newState === 'unconscious') 
      entityToChange.healthPoints.currentValue = 0;
  
    return entityEditAfterWare(io, gameState, newState);
  }
  
  
  
  
  
  function handleEntityEdit(userID: string, payload: EditEntityRequestPayload, gameState: MainState, io){
    if (!isUserGM(userID)) return gameState;
    if (["HP", "MP", "PE"].includes(payload.barType)){
      handleBarChange(payload, io, gameState);
      return gameState;
    }
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(payload.entityID, newState);
    if (!entityToChange) return gameState;
  
    if (["conditions", "imgSource", "name"].includes(payload.barType)){
      entityToChange[payload.barType] = payload.value;
      return entityEditAfterWare(io, gameState, newState);
    }
  
    return gameState;
  }
  

  
  function getNewBarValues(payload: EditEntityRequestPayload, entityToChange: EntityType, attributeName: BarAttributeName): CharacterBar | null{
    const currentBar : CharacterBar = entityToChange[attributeName];
    const currentValue = payload.valueType === 'current' ? currentBar.currentValue : currentBar.maxValue;
    const calculatedValue = getNewBarPayloadValue(payload, currentValue);
    const newValue = calculatedValue >= 0? calculatedValue : 0;
  
    if (payload.valueType === 'max') {
      if (newValue < currentBar.currentValue) return {currentValue: newValue, maxValue: newValue};
      return {currentValue: currentBar.currentValue, maxValue: newValue} 
    }
  
    if (payload.valueType === 'current'){
      if (newValue > currentBar.maxValue) return {currentValue: currentBar.maxValue, maxValue: currentBar.maxValue}
      return {currentValue: newValue, maxValue: currentBar.maxValue}
    }
  
    return null;
  }
  
  function getNewBarPayloadValue(newValuePayload: string, currentValue: number): number{
    const firstSign = newValuePayload.charAt(0);
    const mathOrder = ["+", "-"].includes(firstSign);
    if (!mathOrder) return Number(newValuePayload);
    if (mathOrder && firstSign === "+") return currentValue + Number(newValuePayload.substring(1));
    if (mathOrder && firstSign === "-") return currentValue - Number(newValuePayload.substring(1));
    return 0;
  }
  

  
  function findEntityByID(id: string, gameState: GameState){
    return gameState.allies.find(entity => entity.id === id) || gameState.foes.find(entity => entity.id === id);
  }

  function handleTurnDone(userID: string, entityID: string, gameState: MainState, io){
    if (!isUserGM(userID)) return gameState;
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(entityID, newState);
    if (!entityToChange) return gameState;
    entityToChange.turnDone =!entityToChange.turnDone;
    return entityEditAfterWare(io, gameState, newState);
  }
  
  function handleFullRest(userID: string, entityID: string, gameState: MainState, io){
    if (!isUserGM(userID)) return gameState;
    return restoreEntity(entityID, gameState, io);
  }

  function restoreEntity(entityID: string, gameState: MainState, io){
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(entityID, newState);
    if (!entityToChange) return gameState;
    entityToChange.healthPoints.currentValue = entityToChange.healthPoints.maxValue;
    entityToChange.magicPoints.currentValue = entityToChange.magicPoints.maxValue;
    entityToChange.status = 'alive';
    return entityEditAfterWare(io, gameState, newState);
  }

  function handleAffilationToogle(userID: string, entityID: string, gameState: MainState, io){
    if (!isUserGM(userID)) return gameState;
    const newState = {...gameState.current};
    const foundAlly = newState.allies.find(entity => entity.id === entityID);
    const foundFoe = newState.foes.find(entity => entity.id === entityID);
    if (!foundAlly && !foundFoe) return gameState;
    const copiedEntity: EntityType = foundAlly? {...foundAlly} : {...foundFoe} as EntityType;
    newState.allies = newState.allies.filter(entity => entity.id !== entityID);
    newState.foes = newState.foes.filter(entity => entity.id !== entityID);
    const newAffilation = foundAlly? 'foes' : 'allies';
    newState[newAffilation].push(copiedEntity);
    return entityEditAfterWare(io, gameState, newState);
  }

  function handleDuplicateEntity(userID: string, entityID: string, gameState: MainState, io){
    if (!isUserGM(userID)) return gameState;
    return duplicateEntity(entityID, gameState, io);
  }

  function duplicateEntity(entityID: string, gameState: MainState, io){
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(entityID, newState);
    if (!entityToChange) return gameState;
    const dataToDuplicate = currentEntityDataToNewEntityRequestData(entityToChange);
    return appendEntity(dataToDuplicate, gameState, io);
  }

  function currentEntityDataToNewEntityRequestData(currentEntity: EntityType): EntityRequestData{
    return{
        name: currentEntity.name,
        imgSource: currentEntity.imgSource,
        entityType: 'foe',
        hp: String(currentEntity.healthPoints.maxValue),
        mp: String(currentEntity.magicPoints.maxValue),
        pe: String(currentEntity.equipmentPoints.maxValue),
    }
  }