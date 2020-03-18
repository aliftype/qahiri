import sys
import yaml

with open(sys.argv[1]) as fp:
    conf = yaml.safe_load(fp)
    print(conf["version"])
