import net from "net";
import { handleSocket } from "./modules/communication";

const server = net.createServer(handleSocket);

server.listen(8484, () => {
  console.log("MUD server is listening on port 8484");
});
