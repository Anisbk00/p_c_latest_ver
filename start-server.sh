#!/bin/bash
cd /home/z/my-project
exec node --max-old-space-size=1536 /home/z/my-project/node_modules/.bin/next dev -p 3000
