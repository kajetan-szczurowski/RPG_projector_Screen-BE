import * as uuid from "jsr:@std/uuid";
import { EntityRequestData, EntityType, MainStateType, DeleteEntityRequestPayload, EditEntityRequestPayload } from "./types.ts";
import {BarAttributeName, CharacterBar, ChangeEntityStateRequestPayload} from "./types.ts";
import { isUserGM, getUserID, saveState } from "./system.ts";

const MAIN_STATE_SOCKET_KEY = 'entities-state';
const barsRequestMap: {[key: string]: BarAttributeName} = {
  "HP": "healthPoints",
  "MP": "magicPoints",
  "PE": "equipmentPoints"
};


export function handleEntities(socket, io, onlineUsers: Map<string, string>, gameState: MainStateType){
    socket.on('add-entity', newEntity => {handleNewEntity(getUserID(socket.id, onlineUsers), newEntity, gameState, io)});
    socket.on('delete-entity', payload => {handleEntityDeletion(getUserID(socket.id, onlineUsers), payload, gameState, io)});
    socket.on('entity-edit', payload => {handleEntityEdit(getUserID(socket.id, onlineUsers), payload, gameState, io)});
    socket.on('entity-set-state', payload => {handleEntityChangeState(getUserID(socket.id, onlineUsers), payload, gameState, io)});
    socket.on('toogle-turn-done', (payload) => {handleTurnDone(getUserID(socket.id, onlineUsers), payload.entityID, gameState, io)});
    socket.on('full-rest', (payload) => {handleFullRest(getUserID(socket.id, onlineUsers), payload.entityID, gameState, io)});
    socket.on('duplicate-entity', (payload) => {handleDuplicateEntity(getUserID(socket.id, onlineUsers), payload.entityID, gameState, io)});
    socket.on('toogle-affiliation', (payload) => {handleAffilationToogle(getUserID(socket.id, onlineUsers), payload.entityID, gameState, io)});

}

function entityEditAfterWare(io, gameState:MainStateType){
    io.emit(MAIN_STATE_SOCKET_KEY, gameState);
    saveState(gameState);
}


function handleNewEntity(userID: string, newEntity: EntityRequestData, gameState: MainStateType, io){
    const {...entity} = newEntity;
    if (!isUserGM(userID)) return;
    appendEntity(entity, gameState, io);
}


function appendEntity(entityData: EntityRequestData, gameState: MainStateType, io){
    const newEntity: EntityType = {
        id: uuid.v1.generate(),
        name: entityData.name,
        conditions: '',
        healthPoints: {currentValue: parseInt(entityData.hp), maxValue: parseInt(entityData.hp)},
        magicPoints: {currentValue: parseInt(entityData.mp), maxValue: parseInt(entityData.mp)},
        equipmentPoints: {currentValue: parseInt(entityData.pe), maxValue: parseInt(entityData.pe)},
        imgSource: entityData.imgSource,
        status: 'alive',
        statsVisibleByPlayers: false
    }

    const stateKey = entityData.entityType === 'foe'? 'foes': 'allies';
    gameState[stateKey].push(newEntity);
    entityEditAfterWare(io, gameState)
}

function handleEntityDeletion(userID: string, payload: DeleteEntityRequestPayload, gameState: MainStateType, io){
    if (!isUserGM(userID)) return;
    deleteEntity(payload.entityID, gameState);
    entityEditAfterWare(io, gameState);
  }

function deleteEntity(entityID: string, gameState: MainStateType){
    gameState.allies = gameState.allies.filter(entity => entity.id !== entityID);
    gameState.foes = gameState.foes.filter(entity => entity.id !== entityID);
}
  
  function handleEntityChangeState(userID: string, payload: ChangeEntityStateRequestPayload, gameState: MainStateType, io){
    if (!isUserGM(userID)) return;
    const entityToChange = findEntityByID(payload.entityID, gameState);
    if (!entityToChange) return;
  
    if (payload.newState === 'visible-stats'){
      entityToChange.statsVisibleByPlayers = !entityToChange.statsVisibleByPlayers;
    } 
    else entityToChange.status = payload.newState;
  
    if (payload.newState === 'dead' || payload.newState === 'unconscious') 
      entityToChange.healthPoints.currentValue = 0;
  
    entityEditAfterWare(io, gameState);
  }
  
  
  
  
  
  function handleEntityEdit(userID: string, payload: EditEntityRequestPayload, gameState: MainStateType, io){
    if (!isUserGM(userID)) return;
    if (["HP", "MP", "PE"].includes(payload.barType)){
      handleBarChange(payload, io, gameState);
      return;
    }
  
    const entityToChange = findEntityByID(payload.entityID, gameState);
    if (!entityToChange) return;
  
    if (["conditions", "imgSource", "name"].includes(payload.barType)){
      entityToChange[payload.barType] = payload.value;
      entityEditAfterWare(io, gameState);
      return;
    }
  
  
  }
  
  function handleBarChange(payload: EditEntityRequestPayload, io, gameState){
    if (!isBarValueLegit(payload.value)) return;
    const entityToChange = findEntityByID(payload.entityID, gameState);
    if (!entityToChange) return;
    const attributeName = barsRequestMap[payload.barType];
    const newBarValues = getNewBarValues(payload, entityToChange, attributeName);
    if (!newBarValues) return;
    entityToChange[attributeName] = newBarValues;
    entityEditAfterWare(io, gameState);
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
  
  function getNewBarPayloadValue(payload: EditEntityRequestPayload, currentValue: number): number{
    const firstSign = payload.value.charAt(0);
    const mathOrder = ["+", "-"].includes(firstSign);
    if (!mathOrder) return Number(payload.value);
    if (mathOrder && firstSign === "+") return currentValue + Number(payload.value.substring(1));
    if (mathOrder && firstSign === "-") return currentValue - Number(payload.value.substring(1));
    return 0;
  }
  
  function isBarValueLegit(value: string){
    const firstSign = value.charAt(0);
    if (isNaN(Number(firstSign)))
      if (!["-", "+"].includes(firstSign)) return false;
  
    const parsedValue = value.substring(1);
    return !isNaN(Number(parsedValue));
  }
  
  
  function findEntityByID(id: string, gameState: MainStateType){
    return gameState.allies.find(entity => entity.id === id) || gameState.foes.find(entity => entity.id === id);
  }

  function handleTurnDone(userID: string, entityID: string, gameState: MainStateType, io){
    if (!isUserGM(userID)) return;
    const entityToChange = findEntityByID(entityID, gameState);
    if (!entityToChange) return;
    entityToChange.turnDone =!entityToChange.turnDone;
    entityEditAfterWare(io, gameState);
  }
  
  function handleFullRest(userID: string, entityID: string, gameState: MainStateType, io){
    if (!isUserGM(userID)) return;
    restoreEntity(entityID, gameState);
    entityEditAfterWare(io, gameState);
  }

  function restoreEntity(entityID: string, gameState: MainStateType){
    const entityToChange = findEntityByID(entityID, gameState);
    if (!entityToChange) return;
    entityToChange.healthPoints.currentValue = entityToChange.healthPoints.maxValue;
    entityToChange.magicPoints.currentValue = entityToChange.magicPoints.maxValue;
    entityToChange.status = 'alive';
  }

  function handleAffilationToogle(userID: string, entityID: string, gameState: MainStateType, io){
    if (!isUserGM(userID)) return;
    const foundAlly = gameState.allies.find(entity => entity.id === entityID);
    const foundFoe = gameState.foes.find(entity => entity.id === entityID);
    if (!foundAlly && !foundFoe) return;
    const newAffilation = foundAlly? 'foes' : 'allies';
    const copiedEntity: EntityType = foundAlly? {...foundAlly} : {...foundFoe} as EntityType;
    deleteEntity(entityID, gameState);
    gameState[newAffilation].push(copiedEntity);
    entityEditAfterWare(io, gameState);
  }

  function handleDuplicateEntity(userID: string, entityID: string, gameState: MainStateType, io){
    if (!isUserGM(userID)) return;
    duplicateEntity(entityID, gameState, io);
  }

  function duplicateEntity(entityID: string, gameState: MainStateType, io){
    const entityToChange = findEntityByID(entityID, gameState);
    if (!entityToChange) return;
    const dataToDuplicate = currentEntityDataToNewEntityRequestData(entityToChange);
    appendEntity(dataToDuplicate, gameState, io);
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