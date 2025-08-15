import { useParams } from "react-router-dom";
//import RunChallenge from "./RunChallenge"; // your existing tap/run game
import MemoryFlip from "./MemoryGame";     // new memory game component
import CometCatch from "./CometCatch";


import ConnectFlowGrid from "./OrbitPuzzle";
import WaterSortPuzzle from "./WaterSortPuzzle";
import Match3Game from "./WaterSortPuzzle";
import GalaxySlice from "./GalaxySlice";
//import MatchThree from "./MatchThree";     // new match-3 game component

export default function RunGame() {
  const { id } = useParams();

  switch (id) {
   /* case "run-game":
      return <RunChallenge />;*/

    case "memory":
      return <MemoryFlip />;
    case "catch":
        return <CometCatch />;
    case "orbit":
        return <ConnectFlowGrid />;
    case "galaxy-slice":
        return <GalaxySlice />;
    case "match3":
    return <Match3Game />;

   /* case "match3":
      return <MatchThree />;*/

    default:
      return <div className="p-4 text-center text-red-500">Game not found</div>;
  }
}
