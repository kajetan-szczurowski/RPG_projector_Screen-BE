import { serve } from "https://deno.land/std@0.150.0/http/server.ts";
import { Server } from "https://deno.land/x/socket_io@0.1.1/mod.ts";

import {  handleLogin, handleReconnection } from "./system.ts";
import { getInitiatedGameState, handleState, MainState } from "./state.ts";
import { GameState, AssetEditPayload } from "./types.ts";
import { appendEntity, editEntity, deleteEntity } from "./entities.ts";
import { setState } from "./state.ts";

const MAIN_STATE_SOCKET_KEY = 'entities-state';

const io = new Server({
    cors: {
      origin: "http://localhost:5173",
      // origin: "http://192.168.1.66:5173",
      methods: ["GET", "POST"]
    }
  
});

const onlineUsers = new Map<string, string>();
let gameState = getInitiatedGameState(); 

io.on("connection", (socket) => {
  console.log(`socket ${socket.id} connected`);
  onlineUsers.set(socket.id, '');

  socket.emit(MAIN_STATE_SOCKET_KEY, gameState.current);
  socket.emit('reconnect-order');
  socket.on('reconnecting-attempt', (password) => {handleReconnection(socket, password, onlineUsers)})
  setInterval(() => socket.emit("hello", "world"), 5000);

  // handleEntities(socket, io, onlineUsers, gameState);
  // handleState(socket, io, onlineUsers, gameState);

  socket.on('get-full-state', () => socket.emit(MAIN_STATE_SOCKET_KEY, gameState.current));
  socket.on('login-request', (password) => {handleLogin(socket, password, onlineUsers)});

  // socket.on('terminal-command', (payload) => {handleTerminalCommand(payload.userID, payload.command)})


  //entities
  socket.on('edit-asset', (payload: AssetEditPayload) => {
    console.log(payload)
    gameState = setState(gameState, handleAssetEdit(payload, gameState.current));
    io.emit(MAIN_STATE_SOCKET_KEY, gameState.current);
  })

  socket.on("disconnect", (reason) => {
    console.log(`socket ${socket.id} disconnected due to ${reason}`);
    onlineUsers.delete(socket.id);
  });
});


await serve(io.handler(), {
  port: 3000,
  hostname: '0.0.0.0'
});



function handleAssetEdit(payload: AssetEditPayload, currentState: GameState): GameState{
  if (!payload.order || !payload.assetType) return currentState;
  if (payload.assetType === 'clock') return handleClock(payload, currentState);
  if (payload.assetType === 'entity') return handleEntity(payload, currentState);
  return currentState;
}

function handleClock(payload: AssetEditPayload, currentState: GameState): GameState{
  return currentState;
}

function handleEntity(payload: AssetEditPayload, currentState: GameState): GameState{
  switch(payload.order){
    case 'add': return appendEntity(currentState, payload);
    case 'delete': return deleteEntity(currentState, payload.id);
    case 'update': return editEntity(currentState, payload.id, payload.key, payload.value, payload.barType);
  }
  return currentState;
}

// function handleTerminalCommand(userID: string, command: string){
//   if (!isUserGM(userID)) return;
//   switch (command) {
//     case 'turnReset': {
//       entitiesState.allies.forEach(entity => entity.turnDone = false);
//       entitiesState.foes.forEach(entity => entity.turnDone = false);
//       io.emit(MAIN_STATE_SOCKET_KEY, entitiesState);
//       saveState();
//       break;
//     }

//     case 'silkFox': {
//       const src = 'https://static.vecteezy.com/system/resources/thumbnails/022/690/573/small_2x/fox-face-silhouettes-fox-face-svg-black-and-white-fox-vector.jpg';
//       appendEntity({name: 'Jedwabny lis', hp: '70', mp: '40', pe: '7', entityType: 'ally', imgSource: src}, io);
//     }
//   }
// }









