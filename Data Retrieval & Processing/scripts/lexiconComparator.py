# Libraries
from collections import Counter
import nltk
from nltk.corpus import stopwords
import enchant

# Custom Modules
from mcVaderSentiment.mcVaderSentiment import SentimentIntensityAnalyzer
import DatabaseManager as db_man

nltk.download('stopwords')

stop_words = set(stopwords.words('english'))
gb_dict = enchant.Dict("en_GB")

analyser = SentimentIntensityAnalyzer()
print("made analyser")

lex_dict = analyser.make_lex_dict()
print("got lexicon")

tweets_text = db_man.get_all_scotland_tweets().fetchall()
print("retrieved tweets")

not_present_words = Counter()

for i, t in enumerate(tweets_text):
    for word in t[0].split():
        word = word.lower()
        print(i)
        if not gb_dict.check(word) and word not in lex_dict \
                and not word.startswith('@') and not word.startswith('http') \
                and not word.startswith('#'):
            not_present_words.update([word])

for word, count in not_present_words.most_common():
    if count > 10:
        print("{0}: {1}".format(word, count))
