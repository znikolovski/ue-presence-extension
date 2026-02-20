/*
 * <license header>
 */

import { useEffect } from "react";
import { Text } from "@adobe/react-spectrum";
import { register } from "@adobe/uix-guest";
import { extensionId } from "./Constants";
import metadata from '../../../src/app-metadata.json';

function ExtensionRegistration() {
  useEffect(() => {
    const init = async () => {
      const panelUrl = `${window.location.origin}${window.location.pathname || '/'}#/presence`;
      await register({
        id: extensionId,
        metadata,
        methods: {
          rightPanel: {
            addRails() {
              return [
                {
                  id: "agentic-how-to.presence",
                  header: "Active Authors",
                  url: panelUrl,
                  icon: "User"
                }
              ];
            }
          }
        }
      });
    };
    init().catch(console.error);
  }, []);

  return <Text>IFrame for integration with Host (AEM)...</Text>;
}

export default ExtensionRegistration;
