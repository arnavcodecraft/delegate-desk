// Stops any DelegateDesk server still holding the port (for example one paused with Ctrl+Z). Other programs are left alone.
import { config } from '../server/src/config.ts';
import { stopOldServers } from '../server/src/port.ts';
const { stopped, others } = stopOldServers(config.port);
console.log(stopped ? `Stopped ${stopped} DelegateDesk server${stopped > 1 ? 's' : ''} on port ${config.port}.` : `No DelegateDesk server was running on port ${config.port}.`);
if (others) console.log(`Another program is using port ${config.port}; it was left alone.`);
