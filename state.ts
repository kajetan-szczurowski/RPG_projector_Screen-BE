import { GameState } from "./types.ts";

export function getInitiatedGameState(): MainState{
    const currentState = loadState();
    return{
        current : currentState,
        undo: new Stack<GameState>(10),
        redo: new Stack<GameState>(10),
    }
}

export function setState(currentState: MainState, newGameState: GameState): MainState{
    const newMainState = {...currentState};
    newMainState.undo.push({...currentState.current});
    newMainState.current = {...newGameState};
    saveState(newMainState.current);
    return newMainState;
}

export function undoState(currentState: MainState): MainState{
    console.log('undoing')
    return performRedoOrUndo(currentState, 'undo');
}

export function redoState(currentState: MainState): MainState{
    console.log('redoing');
    return performRedoOrUndo(currentState, 'redo');
}

function performRedoOrUndo(currentState: MainState, operation: 'redo' | 'undo'): MainState{
    const secondStack = operation === 'redo'? 'undo' : 'redo';
    const newState = {...currentState};
    const popedValue = newState[operation].pop();
    if (!popedValue) return newState;
    newState[secondStack].push({...popedValue});
    newState.current = {...popedValue};
    return newState;
}


function saveState(state: GameState){
    const stringifiedState = JSON.stringify(state);
    Deno.writeTextFileSync("state.json", stringifiedState);
  }
  
function loadState(): GameState{
    //TODO: Check for errors in file
    try{
      const read = Deno.readFileSync("state.json");
      return JSON.parse(new TextDecoder().decode(read));
    }
    catch{
      return {allies: [], foes: [], clocks: []}
    }
    
  }

class Stack<T>{
    data: T[];
    maxLength: number | null;

    constructor(maxLength : number = 0){
      this.data = [];
      this.maxLength = maxLength ?? 0;
      if (this.maxLength <= 0) 
        this.maxLength = null;
    }
    
    push(item : T){
      this.data.push(item);
      if (!this.maxLength) return;
      if (this.data.length > this.maxLength) this.data.shift();
    }
    
    pop(){
      if (this.data.length === 0) return;
      return this.data.pop();
    }
  }
  

  
  
export type MainState = {
    current: GameState,
    undo: Stack<GameState>,
    redo: Stack<GameState>
  }