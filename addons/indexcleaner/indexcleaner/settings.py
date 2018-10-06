from logging import INFO, ERROR
from os import getenv

ES_HOST = getenv('ES_HOST','search-centralized-logging-ejzwewbtt2vlndvvji2orm55vu.us-east-1.es.amazonaws.com')
AWS_REGION = getenv('AWS_REGION','us-east-1')

LOGGING_CONFIG = {
    'version': 1,
    'disable_existing_loggers': False,
    'loggers': {
        'indexcleaner': {
            'level': INFO,
        }
    }
}