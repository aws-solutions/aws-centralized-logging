#!/bin/bash 
# 
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned 
# 
# This script should be run from the repo's deployment directory 
# cd deployment 
# ./run-unit-tests.sh 
# 
 
# Get reference for all important folders 
template_dir="$PWD" 
source_dir="$template_dir/../source" 
 
echo "------------------------------------------------------------------------------" 
echo "[Test] Services" 
echo "------------------------------------------------------------------------------" 
cd $source_dir/services/indexing 
npm install
npm run build 
npm test 
 
