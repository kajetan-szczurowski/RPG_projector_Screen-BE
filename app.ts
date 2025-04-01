import { serve } from "https://deno.land/std@0.150.0/http/server.ts";
import { Server } from "https://deno.land/x/socket_io@0.1.1/mod.ts";

import * as uuid from "jsr:@std/uuid";

import { getGMID } from "./secret.ts";

const gmID = getGMID();
const MAIN_STATE_SOCKET_KEY = 'entities-state';
const barsRequestMap: {[key: string]: BarAttributeName} = {
  "HP": "healthPoints",
  "MP": "magicPoints",
  "PE": "equipmentPoints"
};

const io = new Server({
    cors: {
      origin: "http://localhost:5173",
      // origin: "http://192.168.1.54:5173",
      methods: ["GET", "POST"]
    }
  
});

const entitiesState: MainStateType = loadState(); 

io.on("connection", (socket) => {
  console.log(`socket ${socket.id} connected`);
  socket.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
  setInterval(() => socket.emit("hello", "world"), 5000);

  socket.on('add-entity', newEntity => {handleNewEntity(newEntity, io)});
  socket.on('entiity-edit', payload => {handleEntityEdit(payload, io)});
  socket.on('entiity-set-state', payload => {handleEntityChangeState(payload, io)});
  socket.on('delete-entity', payload => {handleEntityDeletion(payload, io)});
  socket.on('get-full-state', () => socket.emit(MAIN_STATE_SOCKET_KEY, entitiesState));
  socket.on('login-request', (password) => {console.log(password); socket.emit('login-result', isUserGM(password))});
  socket.on('toogle-turn-done', (payload) => {handleTurnDone(payload.userID, payload.entityID)});

  socket.on('terminal-command', (payload) => {handleTerminalCommand(payload.userID, payload.command)})


  socket.on("disconnect", (reason) => {
    console.log(`socket ${socket.id} disconnected due to ${reason}`);
  });
});

await serve(io.handler(), {
  port: 3000,
  hostname: '0.0.0.0'
});

function handleTerminalCommand(userID: string, command: string){
  if (!isUserGM(userID)) return;
  switch (command) {
    case 'turnReset': {
      entitiesState.allies.forEach(entity => entity.turnDone = false);
      entitiesState.foes.forEach(entity => entity.turnDone = false);
      io.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
      saveState();
      break;
    }
  }
}

function handleTurnDone(userID: string, entityID: string){
  if (!isUserGM(userID)) return;
  const entityToChange = findEntityByID(entityID);
  if (!entityToChange) return;
  entityToChange.turnDone =!entityToChange.turnDone;
  io.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
  saveState();
}

function handleEntityDeletion(payload: DeleteEntityRequestPayload, io){
  if (!isUserGM(payload.userID)) return;
  entitiesState.allies = entitiesState.allies.filter(entity => entity.id !== payload.entityID);
  entitiesState.foes = entitiesState.foes.filter(entity => entity.id !== payload.entityID);
  io.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
  saveState();
}

function handleEntityChangeState(payload: ChangeEntityStateRequestPayload, io){
  if (!isUserGM(payload.userID)) return;
  const entityToChange = findEntityByID(payload.entityID);
  if (!entityToChange) return;

  if (payload.newState === 'visible-stats'){
    entityToChange.statsVisibleByPlayers = !entityToChange.statsVisibleByPlayers;
  } 
  else entityToChange.status = payload.newState;

  if (payload.newState === 'dead' || payload.newState === 'unconscious') 
    entityToChange.healthPoints.currentValue = 0;

  io.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
  saveState();
}

function handleNewEntity(newEntity: EntityRequestData & {userID: string}, io){
    const {userID, ...entity} = newEntity;
    console.log(`new entity request by ${userID}`)
    if (!isUserGM(userID)) return;
    console.log(entity);
    appendEntity(entity, io);
}

function appendEntity(entityData: EntityRequestData, io){
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
    entitiesState[stateKey].push(newEntity);
    io.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
    saveState();
}

function handleEntityEdit(payload: EditEntityRequestPayload, io){
  if (!isUserGM(payload.userID)) return;
  if (["HP", "MP", "PE"].includes(payload.barType)){
    handleBarChange(payload, io);
    return;
  }

  if (payload.barType === "conditions"){
    const entityToChange = findEntityByID(payload.entityID);
    if (!entityToChange) return;
    entityToChange.conditions = payload.value;
    io.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
    saveState();
  }
}

function handleBarChange(payload: EditEntityRequestPayload, io){
  if (!isBarValueLegit(payload.value)) return;
  const entityToChange = findEntityByID(payload.entityID);
  if (!entityToChange) return;
  const attributeName = barsRequestMap[payload.barType];
  const newBarValues = getNewBarValues(payload, entityToChange, attributeName);
  if (!newBarValues) return;
  entityToChange[attributeName] = newBarValues;
  io.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
  saveState();
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


function findEntityByID(id: string){
  return entitiesState.allies.find(entity => entity.id === id) || entitiesState.foes.find(entity => entity.id === id);
}

function isUserGM(userID:string){
    return userID === gmID;
}

function saveState(){
  const currentState = JSON.stringify(entitiesState);
  Deno.writeTextFileSync("state.json", currentState);
}

function loadState(): MainStateType{
  const read = Deno.readFileSync("state.json");
  return JSON.parse(new TextDecoder().decode(read));
}

type EntityType = {
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

type CharacterBar = {
    currentValue: number,
    maxValue: number
}

type CharacterStatus = 'alive' | 'unconscious' | 'dead';
type EntityState = 'alive' | 'unconscious' | 'dead' | 'visible-stats';

type MainStateType = {
  allies: EntityType[],
  foes: EntityType[],
}

type EntityRequestData = {
    name: string;
    hp: string;
    mp: string;
    pe: string;
    entityType: 'ally' | 'foe';
    imgSource: string;
}

type EditEntityRequestPayload = {
  userID: string,
  barType: "MP" | "HP" | "PE" | "conditions"
  valueType: 'current' | 'max'
  value: string,
  entityID: string
}

type ChangeEntityStateRequestPayload = {
  userID: string,
  entityID: string,
  newState: EntityState
}

type DeleteEntityRequestPayload = {
  userID: string,
  entityID: string,
}


type BarAttributeName = 'healthPoints' | 'magicPoints' | 'equipmentPoints'

