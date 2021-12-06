#!/bin/bash
#
# This assumes all of the OS-level configuration has been completed and git repo has already been cloned
#
# This script should be run from the source directory
# cd source
# ./run-unit-tests.sh
#

["$DEBUG" == 'true' ] && set -x
set -e

# Get reference for all important folders
source_dir="$PWD"
resource_dir="$source_dir/resources"
services_dir="$source_dir/services"

echo "------------------------------------------------------------------------------"
echo "[Pre-Test] build binaries"
echo "------------------------------------------------------------------------------"
cd $services_dir/transformer
npm run build:all

cd $services_dir/helper
npm run build:all

echo "------------------------------------------------------------------------------"
echo "[Test] Resources"
echo "------------------------------------------------------------------------------"
cd $resource_dir
npm run test -- -u

echo "------------------------------------------------------------------------------"
echo "[Test] helper"
echo "------------------------------------------------------------------------------"
cd $services_dir/helper
npm run test

echo "------------------------------------------------------------------------------"
echo "[Test] transformer"
echo "------------------------------------------------------------------------------"
cd $services_dir/transformer
npm run test

