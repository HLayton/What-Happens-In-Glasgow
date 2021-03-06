import { Injector } from '@angular/core';
import {HttpClient} from '@angular/common/http';

import {TweetService} from '../tweet/tweet.service';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import {Observable} from 'rxjs/Observable';
import {District} from '../../_models/District';
import {AreaData} from '../../_models/AreaData';
import {Tweet} from '../../_models/Tweet';
import {Feature, FeatureCollection} from 'geojson';
import {DataManagerInterface} from '../../_interfaces/data-manager.interface';
import {MapModes} from '../../_models/MapModes';

declare let d3: any;
import * as moment from 'moment';

/**
 *
 */
export abstract class AbstractDataManager implements DataManagerInterface {
  // Services
  protected _http: HttpClient;
  protected _tweet: TweetService;

  // Fields
  protected district = new BehaviorSubject<District>(new District());
  public    districts: {[id: string]: District} = {};
  protected districtsSubject = new BehaviorSubject<{[id: string]: District}>(undefined);
  protected latestTweet = new BehaviorSubject<Tweet>(undefined);
  protected mapTopology = new BehaviorSubject<FeatureCollection<any>>(undefined);
  protected loadedData = new BehaviorSubject<boolean>(false);
  protected districtTimeChanged = new BehaviorSubject<boolean>(false);

  // Map identifiers
  public regionName: string;
  public mapType: string;
  public dataFile: string;
  public districtId: string;
  public mapMode: MapModes;
  public allowRegionPulsing: boolean;
  protected apiDataRoute: string;

  // GeoJSON data keys
  public topologyId: string;
  public topologyName: string;

  private targetDate = moment();
  public updateTweets = true;


  constructor(injector: Injector) {
    this._http = injector.get(HttpClient);
    this._tweet = injector.get(TweetService);
  }

  public getDistrict(): Observable<District> {
    return this.district.asObservable();
  }

  public getDistricts(): Observable<{[id: string]: District}> {
    return this.districtsSubject.asObservable();
  }

  public getLatestTweet(): Observable<Tweet> {
    return this.latestTweet.asObservable();
  }

  public getMapTopology(): Observable<FeatureCollection<any>> {
    return this.mapTopology.asObservable();
  }

  public getLoadedData(): Observable<boolean> {
    return this.loadedData.asObservable();
  }

  public getTweets(): Observable<{[id: string]: Tweet[]}> {
    return this._tweet.getTweets();
  }

  public getMapBoundaryId(): string {
    return this.mapType + '-boundary';
  }

  public isDistrictTimeChanged(): Observable<boolean> {
    return this.districtTimeChanged.asObservable();
  }

  public updateLastTweet(tweet: Tweet, id: string): void {

    const new_scores = [];
    const new_words = [];

    // Highlight emotive words
    tweet.text = tweet.text.split(' ').map(word => this.highlightEmotiveWords(word, tweet, new_words, new_scores)).join(' ');
    tweet.text_sentiment_words = [...new_words, ...tweet.text_sentiment_words];
    tweet.text_sentiments = [...new_scores, ...tweet.text_sentiments];

    // If the tweet belongs to the whole map area, set the id accordingly
    id = (this.districtId === id) ? this.mapType + '-boundary' : id;

    tweet.id = id;
    const district = this.districts[id];
    const region = this.districts[this.mapType + '-boundary'];

    // If the id isn't equivalent to the region, update it
    if (region && district && region !== district) {
      this.districts[this.mapType + '-boundary'] = this.updateDistrict(region, tweet);
    }

    // If id matched one of the map disticts, update it
    if (district) {
      this.districts[id] = this.updateDistrict(district, tweet);
    }

    // If the id matched the district or one of the regions, update the values
    if (region || district) {
      this.districtsSubject.next(this.districts);
      this.latestTweet.next(tweet);
    }
  }

  public setDistrictDataTime(index: number): void {
    for (const district of Object.values(this.districts)) {
      if (district) {
        const values = district.values[index];

        if (values) {
          district.average = values.y;
          district.prettyAverage = Math.round(district.average * 10) / 10;

          if (!district.common_emote_words)
            district.common_emote_words = {};

          if (district.common_emote_words.hasOwnProperty(values.x))
            district.currentWords = district.common_emote_words[values.x];
          else
            district.currentWords = [];
        }
      }
    }


    this.districtsSubject.next(this.districts);
    this.districtTimeChanged.next(true);

  }

  public setDistrictDataDates(): void {
    for (const district of Object.values(this.districts)) {
      if (district) {
        let sum = 0;
        for (const v of district.values) {
          sum += v.y;
        }

        district.average = sum / district.values.length;
        district.prettyAverage = Math.round(district.average * 10) / 10;

        if (!district.common_emote_words)
          district.common_emote_words = {};

        if (district.common_emote_words.hasOwnProperty('overall'))
          district.currentWords = district.common_emote_words['overall'];
        else
          district.currentWords = [];
      }
    }

    this.districtsSubject.next(this.districts);
    this.districtTimeChanged.next(true);
  }

  public highlightEmotiveWords(word, tweet, new_words, new_scores) {
    if (tweet.text_sentiment_words[0] && word.toLowerCase().startsWith(tweet.text_sentiment_words[0])) {
      new_words.push(tweet.text_sentiment_words.shift());
      const score = tweet.text_sentiments.shift();
      new_scores.push(score);

      if (score > 0 ) {
        word = '<span class="good_word">' + word + '</span>';
      } else if (score < 0) {
        word = '<span class="bad_word">' + word + '</span>';
      }

    }

    return word;
  }

  private updateDistrict(district: District, tweet: Tweet): District {
    if (this.updateTweets && new Date(district.values[district.values.length - 1].x).toDateString() === new Date().toDateString()) {
      // Check if a new hour has started, in which case update all stats to be for this hour
      if (moment(tweet.date).hour() !== moment(district.values[district.values.length - 1].x).hour()) {
        this.addNewHourData();
      }
      tweet.name = tweet.user.name;

      let sum = district.average * district.totals[district.totals.length - 1];
      sum = (!isNaN(sum)) ? sum + tweet.score : tweet.score;

      tweet.date = new Date().toISOString();

      district.total++;
      district.totals[district.totals.length - 1]++;
      district.average = sum / district.totals[district.totals.length - 1];
      if (district.values && district.values.length > 0 && district.values[district.values.length - 1])
        district.values[district.values.length - 1].y = district.average;
      district.prettyAverage = Math.round(district.average * 10) / 10;

      const nowDate = new Date();
      nowDate.setMinutes(nowDate.getMinutes() - 1);

      district.last_tweets = district.last_tweets.filter((x) => new Date(x.date) > nowDate);

      // Update most common words
      if (district.common_emote_words) {
        const hourKey = moment().minute(0).second(0).millisecond(0).valueOf();
        for (let i = 0; i < tweet.text_sentiment_words.length; i++) {
          const word = tweet.text_sentiment_words[i];

          // If the word exists in the object, add 1
          if (district.common_emote_words.hasOwnProperty(hourKey) && district.common_emote_words[hourKey].hasOwnProperty(word)) {
            district.common_emote_words[hourKey][word].freq++;

            // if the word has a sentiment weight add it to the object
          } else if (tweet.text_sentiments[i] !== 0 && word.length > 2) {
            if (!district.common_emote_words.hasOwnProperty(hourKey)) district.common_emote_words[hourKey] = {};
            district.common_emote_words[hourKey][word] = {
              word: word,
              freq: 1,
              score: this.wordScoreToAreaScore(tweet.text_sentiments[i])
            };
          }
        }
      }

      district.last_tweets.unshift(tweet);
      if (this.mapMode === MapModes.Scotland && district.id === this.districtId) {
        this._tweet.addTweet(tweet);
      }
    }

    return district;
  }

  private addNewHourData() {
    if (this.districts) {
      const hourKey = moment().minute(0).second(0).millisecond(0).valueOf();
      for (const district of Object.values(this.districts)) {
        district.totals.push(0);
        district.average = 50;
        district.prettyAverage = 50;
        district.values.push({ x: hourKey, y: 50});
      }
    }
  }

  private wordScoreToAreaScore(score): number {
    return (score + 4) / 8 * 100;
  }

  /**
   * Loads the districts from a JSON file. Generates data for these districts and passes this data
   * to the child map component.
   */
  public loadDistrictsData(): void {
    this.loadedData.next(false);
    d3.json('./assets/json/' + this.dataFile, (error, topology: FeatureCollection<any>) => {
      if (error) {
        console.error(error);
      } else {
        const areaIds: string[] = [];
        const areaNames: {[id: string]: string} = {};

        // Extract data for each district
        topology.features.forEach( (feature: Feature<any>) => {
          const id = feature.properties[this.topologyId];
          areaNames[id] = feature.properties[this.topologyName];
          areaIds.push(id);
        });

        // All of regions data
        areaIds.push(this.districtId);
        areaNames[this.districtId] = this.regionName;

        this.getDistrictsData(areaIds).subscribe(
          results => {
            for (let i = 0; i < areaIds.length; i++) {
              const id = areaIds[i];
              const wardData: AreaData = results[id];

              const values = wardData.values;
              const name = areaNames[id];
              const average = (values.length > 0) ? values[values.length - 1].y : 0;
              const prettyAverage = Math.round(average * 10) / 10;
              if (wardData.last_tweet) wardData.last_tweet.date = new Date().toISOString();
              const last_tweets: Tweet[] = (wardData.last_tweet) ?
                [wardData.last_tweet] :
                [];

              const districtId = (id === this.districtId) ? this.getMapBoundaryId() : id;
              this.districts[districtId] = {
                id,
                name,
                values,
                average,
                prettyAverage,
                last_tweets,
                total: wardData.total,
                totals: wardData.totals
              };
            }
          },
          err => {
            console.error(err);
          },
          () => {
            this.fetchCommonWords(areaIds);
            this.loadedData.next(true);
            this.districtsSubject.next(this.districts);
            this.mapTopology.next(topology);
            this.setDistrict(this.mapType + '-boundary');
            this.fetchDistrictTweets(this.targetDate, false);
          }
        );
      }
    });
  }

  private fetchCommonWords(ids: string[], period = 3) {
    this.getCommonWords(ids, this.targetDate, period).subscribe(
      results => {
        const timestamp = moment().minute(0).second(0).millisecond(0).valueOf();
        for (let [key, value] of Object.entries(results)) {
          // value = value.slice(0, 30);
          key = (key === 'region') ? this.getMapBoundaryId() : key;
          if (this.districts[key]) {
            this.districts[key].common_emote_words = {'overall': {}};

            for (const [inKey, inValue] of Object.entries(value)) {
              const values = {};
              for (const v of inValue) {
                const vs = v.split(', ');
                const vObj = {
                  word: vs[0],
                  score: this.wordScoreToAreaScore(parseFloat(vs[1])),
                  freq: parseFloat(vs[2])
                };

                values[vObj.word] = vObj;
                if (this.districts[key].common_emote_words.overall.hasOwnProperty(vObj.word)) {
                  this.districts[key].common_emote_words.overall[vObj.word].freq++;
                } else {
                  this.districts[key].common_emote_words.overall[vObj.word] = vObj;
                }
              }
              this.districts[key].common_emote_words[inKey] = values;
            }
          }
        }

        for (const v of Object.values(this.districts)) {
          if (v.common_emote_words && v.common_emote_words[timestamp]) {
            v.currentWords = v.common_emote_words[timestamp];
          } else {
            v.currentWords = [];
          }
        }

        this.districtsSubject.next(this.districts);
        this.district.next(this.district.getValue());
      });
  }

  public fetchDistrictTweets(date: moment.Moment, append: boolean) {
    if (this.mapMode === MapModes.Scotland) {
      this.getDistrictsTweets(date).subscribe(
        results => {
          // results.map(t => t.date = new Date(t.date));
          this._tweet.setTweets(results, date, append);
        }
      );
    }
  }

  public refreshAllDistrictsData(date: Date, period: number) {
    this.targetDate = moment(date);
    this.loadedData.next(false);
    const areaIds: string[] = [];
    const areaNames: {[id: string]: string} = {};

    for (const [key, value] of Object.entries(this.districts)) {
      if (key !== this.getMapBoundaryId()) {
        areaIds.push(key);
        areaNames[key] = value.name;
      }
    }

    areaIds.push(this.districtId);
    areaNames[this.districtId] = this.regionName;

    this.getDistrictsData(areaIds, date, period).subscribe(
      results => {
        for (let i = 0; i < areaIds.length; i++) {
          const id = areaIds[i];
          const wardData: AreaData = results[id];

          const values = wardData.values;
          const name = areaNames[id];
          const average = (values.length > 0) ? values[values.length - 1].y : 0;
          const prettyAverage = Math.round(average * 10) / 10;
          if (wardData.last_tweet) wardData.last_tweet.date = new Date().toISOString();
          const last_tweets: Tweet[] = (wardData.last_tweet) ?
            [wardData.last_tweet] :
            [];

          const districtId = (id === this.districtId) ? this.getMapBoundaryId() : id;
          this.districts[districtId] = {
            id,
            name,
            values,
            average,
            prettyAverage,
            last_tweets,
            total: wardData.total,
            totals: wardData.totals
          };
        }
      },
      err => {
        console.error(err);
      },
      () => {
        this.fetchCommonWords(areaIds, period);
        this.loadedData.next(true);
        this.districtsSubject.next(this.districts);
        this.setDistrict(this.mapType + '-boundary');
        this.fetchDistrictTweets(this.targetDate, false);
      }
    );
  }

  /**
   * Sets the district as selected. Called by the child components.
   * @param {string} area - id of the selected district
   */
  public setDistrict(area: string): void {
    this.district.next(this.districts[area]);
  }

  protected getDistrictsData(ids: string[], date: Date = new Date(), period: number = 3) {
    const dateString: string = moment(date).format('YYYY-MM-DD HH');
    return this._http.get<any>('/api/' + this.apiDataRoute, {
      params: {ids, region: 'true', date: dateString, period: '' + period}
    });
  }

  protected getCommonWords(ids: string[], date: moment.Moment = moment(), period: number = 3) {
    const dateString: string = date.format('YYYY-MM-DD HH');
    const params = {
        ids,
        region: 'true',
        group: (this.districtId.includes('boundary')) ? 'area' : 'ward',
        date: dateString,
        period: '' + period
    };

    if (!this.districtId.includes('boundary'))  params['region_id'] = this.districtId;

    return this._http.get<any>('/api/common_words', { params });
  }

  protected getDistrictsTweets(date: moment.Moment) {
    return this._http.get<any>('/api/districts_tweets', {
      params: {date: date.format('YYYY-MM-DD HH')}
    });
  }

  public setUpdateTweets(bool: boolean) {
    this.updateTweets = bool;
  }

  protected abstract listenOnSockets(): void;
}

