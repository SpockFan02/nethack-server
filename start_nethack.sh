#!/bin/bash

cd /home/beebop/src/wsterm
./leaderboardd &
./server2 >server.log 2>&1 &
