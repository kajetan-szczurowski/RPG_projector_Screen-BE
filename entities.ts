import * as uuid from "jsr:@std/uuid";
import { EntityRequestData, EntityType, MainStateType, DeleteEntityRequestPayload, EditEntityRequestPayload } from "./types.ts";
import {BarAttributeName, CharacterBar, ChangeEntityStateRequestPayload, GameState} from "./types.ts";
import { isUserGM, getUserID } from "./system.ts";
import { setState, MainState } from "./state.ts";

//TODO: prepare some middleware to reduce code multiplication e.g. const newState = {...gameState.current};

const MAIN_STATE_SOCKET_KEY = 'entities-state';
const barsRequestMap: {[key: string]: BarAttributeName} = {
  "HP": "healthPoints",
  "MP": "magicPoints",
  "PE": "equipmentPoints"
};


export function handleEntities(socket, io, onlineUsers: Map<string, string>, gameState: MainState){
    socket.on('add-entity', newEntity => {handleNewEntity(getUserID(socket.id, onlineUsers), newEntity, gameState, io)});
    socket.on('delete-entity', payload => {handleEntityDeletion(getUserID(socket.id, onlineUsers), payload, gameState, io)});
    socket.on('entity-edit', payload => {handleEntityEdit(getUserID(socket.id, onlineUsers), payload, gameState, io)});
    socket.on('entity-set-state', payload => {handleEntityChangeState(getUserID(socket.id, onlineUsers), payload, gameState, io)});
    socket.on('toogle-turn-done', (payload) => {handleTurnDone(getUserID(socket.id, onlineUsers), payload.entityID, gameState, io)});
    socket.on('full-rest', (payload) => {handleFullRest(getUserID(socket.id, onlineUsers), payload.entityID, gameState, io)});
    socket.on('duplicate-entity', (payload) => {handleDuplicateEntity(getUserID(socket.id, onlineUsers), payload.entityID, gameState, io)});
    socket.on('toogle-affiliation', (payload) => {handleAffilationToogle(getUserID(socket.id, onlineUsers), payload.entityID, gameState, io)});

}

function entityEditAfterWare(io, gameState:MainState, newState: GameState){
    io.emit(MAIN_STATE_SOCKET_KEY, newState);
    setState(gameState, newState)
}


function handleNewEntity(userID: string, newEntity: EntityRequestData, gameState: MainState, io){
    const {...entity} = newEntity;
    if (!isUserGM(userID)) return;
    appendEntity(entity, gameState, io);
}


function appendEntity(entityData: EntityRequestData, gameState: MainState, io){
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
    const newState = {...gameState.current};
    newState[stateKey].push(newEntity);
    entityEditAfterWare(io, gameState, newState);
}

function handleEntityDeletion(userID: string, payload: DeleteEntityRequestPayload, gameState: MainState, io){
    if (!isUserGM(userID)) return;
    deleteEntity(io, payload.entityID, gameState);
  }

function deleteEntity(io, entityID: string, gameState: MainState){
    const newState = {...gameState.current};
    newState.allies = newState.allies.filter(entity => entity.id !== entityID);
    newState.foes = newState.foes.filter(entity => entity.id !== entityID);
    entityEditAfterWare(io, gameState, newState);
}
  
  function handleEntityChangeState(userID: string, payload: ChangeEntityStateRequestPayload, gameState: MainState, io){
    if (!isUserGM(userID)) return;
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(payload.entityID, newState);
    if (!entityToChange) return;
  
    if (payload.newState === 'visible-stats'){
      entityToChange.statsVisibleByPlayers = !entityToChange.statsVisibleByPlayers;
    } 
    else entityToChange.status = payload.newState;
  
    if (payload.newState === 'dead' || payload.newState === 'unconscious') 
      entityToChange.healthPoints.currentValue = 0;
  
    entityEditAfterWare(io, gameState, newState);
  }
  
  
  
  
  
  function handleEntityEdit(userID: string, payload: EditEntityRequestPayload, gameState: MainState, io){
    if (!isUserGM(userID)) return;
    if (["HP", "MP", "PE"].includes(payload.barType)){
      handleBarChange(payload, io, gameState);
      return;
    }
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(payload.entityID, newState);
    if (!entityToChange) return;
  
    if (["conditions", "imgSource", "name"].includes(payload.barType)){
      entityToChange[payload.barType] = payload.value;
      entityEditAfterWare(io, gameState, newState);
      return;
    }
  
  
  }
  
  function handleBarChange(payload: EditEntityRequestPayload, io, gameState: MainState){
    if (!isBarValueLegit(payload.value)) return;
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(payload.entityID, newState);
    if (!entityToChange) return;
    const attributeName = barsRequestMap[payload.barType];
    const newBarValues = getNewBarValues(payload, entityToChange, attributeName);
    if (!newBarValues) return;
    entityToChange[attributeName] = newBarValues;
    entityEditAfterWare(io, gameState, newState);
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
  
  
  function findEntityByID(id: string, gameState: GameState){
    return gameState.allies.find(entity => entity.id === id) || gameState.foes.find(entity => entity.id === id);
  }

  function handleTurnDone(userID: string, entityID: string, gameState: MainState, io){
    if (!isUserGM(userID)) return;
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(entityID, newState);
    if (!entityToChange) return;
    entityToChange.turnDone =!entityToChange.turnDone;
    entityEditAfterWare(io, gameState, newState);
  }
  
  function handleFullRest(userID: string, entityID: string, gameState: MainState, io){
    if (!isUserGM(userID)) return;
    restoreEntity(entityID, gameState, io);
  }

  function restoreEntity(entityID: string, gameState: MainState, io){
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(entityID, newState);
    if (!entityToChange) return;
    entityToChange.healthPoints.currentValue = entityToChange.healthPoints.maxValue;
    entityToChange.magicPoints.currentValue = entityToChange.magicPoints.maxValue;
    entityToChange.status = 'alive';
    entityEditAfterWare(io, gameState, newState);
  }

  function handleAffilationToogle(userID: string, entityID: string, gameState: MainState, io){
    if (!isUserGM(userID)) return;
    const newState = {...gameState.current};
    const foundAlly = newState.allies.find(entity => entity.id === entityID);
    const foundFoe = newState.foes.find(entity => entity.id === entityID);
    if (!foundAlly && !foundFoe) return;
    const newAffilation = foundAlly? 'foes' : 'allies';
    const copiedEntity: EntityType = foundAlly? {...foundAlly} : {...foundFoe} as EntityType;
    deleteEntity(io, entityID, gameState);
    newState[newAffilation].push(copiedEntity);
    entityEditAfterWare(io, gameState, newState);
  }

  function handleDuplicateEntity(userID: string, entityID: string, gameState: MainState, io){
    if (!isUserGM(userID)) return;
    duplicateEntity(entityID, gameState, io);
  }

  function duplicateEntity(entityID: string, gameState: MainState, io){
    const newState = {...gameState.current};
    const entityToChange = findEntityByID(entityID, newState);
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