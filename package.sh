#!/bin/bash

# Clear and earlier qrl-electrify distribtutions
rm -rf .electrify/.dist/
mkdir .electrify/.dist

# Package app
electrify package -o .electrify/.dist/
