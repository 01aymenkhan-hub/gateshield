import unittest
from unittest.mock import patch

from app.transliteration import english_names, faithful_token, transliterate_token


class TransliterationTests(unittest.TestCase):
    def test_source_is_retained_and_alias_inputs_are_english(self):
        parsed={'name':'عمار احمد صدیقی','fatherName':'ظفر احمد'}
        result=english_names(parsed)
        self.assertEqual(parsed['name'],'Ammar Ahmed Siddiqui')
        self.assertEqual(parsed['fatherName'],'Zafar Ahmed')
        self.assertEqual(parsed['nameUrdu'],'عمار احمد صدیقی')
        self.assertEqual(result['status']['name'],'suggested')
        self.assertTrue(result['warnings'])

    def test_english_and_blank_never_call_transliterator(self):
        parsed={'name':'ALI AHMED','fatherName':''}
        with patch('app.transliteration.transliterate_token') as convert:
            english_names(parsed)
        convert.assert_not_called()
        self.assertEqual(parsed['name'],'ALI AHMED')
        self.assertEqual(parsed['fatherName'],'')

    def test_unknown_word_failure_never_drops_part_of_name(self):
        parsed={'name':'احسن افتخار'}
        with patch('app.transliteration.transliterate_token',side_effect=[('Ahsan','indicxlit'),('','uncertain_transliteration')]):
            result=english_names(parsed)
        self.assertEqual(parsed['name'],'')
        self.assertEqual(parsed['nameUrdu'],'احسن افتخار')
        self.assertEqual(result['status']['name'],'manual_spelling_required')

    def test_unavailable_model_keeps_urdu_and_requires_manual_spelling(self):
        parsed={'name':'احسن افتخار'}
        with patch('app.transliteration.transliterate_token',side_effect=OSError('missing model')):
            result=english_names(parsed)
        self.assertEqual(parsed['name'],'')
        self.assertEqual(parsed['nameUrdu'],'احسن افتخار')
        self.assertEqual(result['status']['name'],'model_unavailable')

    def test_phonetic_guard_rejects_changed_names_and_added_parts(self):
        for source,candidate in [('عمار','Amir'),('عمار','Imam'),('حسن','Hussain'),('علی','Alia'),('ظفر','ZafarAhmed')]:
            with self.subTest(candidate=candidate):self.assertFalse(faithful_token(source,candidate))
        for source,candidate in [('عمار','Ammar'),('حسن','Hassan'),('احسن','Ahsan'),('افتخار','Iftekhar')]:
            with self.subTest(candidate=candidate):self.assertTrue(faithful_token(source,candidate))

    def test_identity_numbers_and_dates_are_not_transliteration_input(self):
        for token in ['42201-2050433-1','12.11.1998','abc','']:
            self.assertEqual(transliterate_token(token)[0],'')


if __name__=='__main__':unittest.main()
