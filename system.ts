import { getGMID } from "./secret.ts";
import { MainStateType } from "./types.ts";

export function isUserGM(userID: string){
    const gmID = getGMID();
    return userID === gmID;
}

export function getUserID(socketID: string, onlineUsers: Map<string, string>){
  return onlineUsers.get(socketID) || "";
}

export function handleLogin(socket, password:string, onlineUsers: Map<string, string>){
    if (!isUserGM(password)){
      socket.emit('login-result', false);
      return;
    }
    onlineUsers.set(socket.id, password);
    socket.emit('login-result', true);
}

export function handleReconnection(socket, password: string, onlineUsers: Map<string, string>){
    if (!isUserGM(password)) return;
    onlineUsers.set(socket.id, password);
}

export function saveState(state: MainStateType){
    const stringifiedState = JSON.stringify(state);
    Deno.writeTextFileSync("state.json", stringifiedState);
  }
  
  export function loadState(): MainStateType{
    const read = Deno.readFileSync("state.json");
    return JSON.parse(new TextDecoder().decode(read));
  }
  